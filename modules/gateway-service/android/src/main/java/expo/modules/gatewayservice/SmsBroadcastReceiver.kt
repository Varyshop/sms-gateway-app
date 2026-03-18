package expo.modules.gatewayservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SubscriptionManager
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/**
 * Static BroadcastReceiver declared in AndroidManifest.xml.
 * Receives SMS even when the app is not running or screen is off.
 *
 * Enqueues inbound SMS reporting via WorkManager (guaranteed delivery
 * even in Doze mode on MIUI/Xiaomi), and also forwards to
 * SmsGatewayService for immediate processing if running.
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

        // Enqueue each grouped message via WorkManager for guaranteed delivery
        for ((from, body) in grouped) {
            Log.i(TAG, "Enqueuing inbound SMS from $from via WorkManager")

            val inputData = workDataOf(
                "from" to from,
                "message" to body.toString(),
                "to" to toNumber,
            )

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val workRequest = OneTimeWorkRequest.Builder(InboundSmsWorker::class.java)
                .setInputData(inputData)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueue(workRequest)

            // Also forward to service for immediate processing (best-effort)
            if (SmsGatewayService.isRunning) {
                SmsGatewayService.reportInboundSms(context, from, body.toString(), toNumber)
            }
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
