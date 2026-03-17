package expo.modules.gatewayservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Starts the SMS Gateway foreground service automatically after device boot.
 * Only starts if the service was previously configured (has API URL + key).
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences(SmsGatewayService.PREFS_NAME, Context.MODE_PRIVATE)
        val apiUrl = prefs.getString("api_url", "") ?: ""
        val apiKey = prefs.getString("api_key", "") ?: ""
        val serviceEnabled = prefs.getBoolean("sms_service_enabled", false)

        if (apiUrl.isNotEmpty() && apiKey.isNotEmpty() && serviceEnabled) {
            Log.i(TAG, "Boot completed, starting SMS Gateway Service")
            try {
                SmsGatewayService.start(context)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start service after boot", e)
            }
        } else {
            Log.d(TAG, "Boot completed, but service not configured or disabled")
        }
    }
}
