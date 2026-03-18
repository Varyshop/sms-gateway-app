package expo.modules.gatewayservice

import android.content.Context
import android.os.PowerManager
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Handles incoming FCM data messages from the Odoo server.
 *
 * When Odoo assigns SMS to a gateway phone, it sends a high-priority
 * data-only FCM message with {type: "sms_pending"}. This service
 * receives it and triggers an immediate poll cycle in SmsGatewayService,
 * replacing the old 10s polling interval with near-instant delivery.
 *
 * Also handles FCM token rotation via onNewToken — the new token is
 * persisted in SharedPreferences and sent to the Odoo server so future
 * pushes reach this device.
 */
class FcmMessageHandler : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FcmMessageHandler"
        private const val WAKELOCK_TAG = "SmsGateway:FcmWake"
        private const val WAKELOCK_TIMEOUT_MS = 30_000L // 30s max
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.i(TAG, "FCM message received: ${remoteMessage.data}")

        val type = remoteMessage.data["type"]
        if (type == "sms_pending") {
            // Acquire WakeLock immediately — Android may suspend CPU within
            // seconds of delivering the FCM message if screen is off / Doze.
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                WAKELOCK_TAG
            )
            wakeLock.acquire(WAKELOCK_TIMEOUT_MS)

            try {
                if (SmsGatewayService.isRunning) {
                    Log.i(TAG, "Triggering immediate poll (service running)")
                    SmsGatewayService.triggerImmediatePoll(this)
                } else {
                    // Service not running — start it; it will poll on startup
                    Log.i(TAG, "Service not running, starting it")
                    SmsGatewayService.start(this)
                }
            } finally {
                // Release after a short delay to let the service acquire its own lock.
                // The timeout-based acquire ensures release even if we forget.
                try {
                    if (wakeLock.isHeld) wakeLock.release()
                } catch (_: Exception) {}
            }
        }
    }

    override fun onNewToken(token: String) {
        Log.i(TAG, "FCM token refreshed")

        // Persist token so the service can register it on next heartbeat
        val prefs = getSharedPreferences(SmsGatewayService.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()

        // If service is running, register with server immediately
        if (SmsGatewayService.isRunning) {
            SmsGatewayService.registerFcmToken(this, token)
        }
    }
}
