package expo.modules.gatewayservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SubscriptionManager
import android.util.Log

/**
 * Static BroadcastReceiver declared in AndroidManifest.xml.
 * Receives SMS even when the app is not running or screen is off.
 *
 * When an SMS arrives, it forwards the data to SmsGatewayService
 * which handles the server communication in the background.
 */
class SmsBroadcastReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmsBroadcastReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        Log.i(TAG, "Received ${messages.size} SMS parts")

        // Group message parts by sender
        val grouped = mutableMapOf<String, StringBuilder>()
        var toNumber = ""

        for (msg in messages) {
            val from = msg.originatingAddress ?: continue
            grouped.getOrPut(from) { StringBuilder() }.append(msg.messageBody ?: "")

            // Try to get receiving number from subscription info
            if (toNumber.isEmpty()) {
                val subId = intent.extras?.getInt("subscription", -1) ?: -1
                if (subId >= 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                    try {
                        val subManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                        val subInfo = subManager?.getActiveSubscriptionInfo(subId)
                        toNumber = subInfo?.number ?: ""
                    } catch (_: SecurityException) { }
                }
            }
        }

        // Forward each grouped message to the foreground service
        for ((from, body) in grouped) {
            Log.i(TAG, "Forwarding SMS from $from to service")
            SmsGatewayService.reportInboundSms(context, from, body.toString(), toNumber)
        }

        // Ensure the foreground service is running (it may have been killed)
        if (!SmsGatewayService.isRunning) {
            Log.i(TAG, "Service not running, attempting to start")
            try {
                SmsGatewayService.start(context)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restart service", e)
            }
        }
    }
}
