package expo.modules.gatewayservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging

class GatewayServiceModule : Module() {

    private var statusReceiver: BroadcastReceiver? = null

    override fun definition() = ModuleDefinition {
        Name("GatewayService")

        // Declare the event that JS can subscribe to
        Events("onStatusChange")

        OnCreate {
            registerStatusReceiver()
        }

        OnDestroy {
            unregisterStatusReceiver()
        }

        /**
         * Start the foreground service.
         * Syncs config from AsyncStorage keys into SharedPreferences
         * so the native service can read them without React Native.
         */
        AsyncFunction("startService") { apiUrl: String, apiKey: String, serviceEnabled: Boolean, pollingInterval: Int, heartbeatInterval: Int ->
            val context = appContext.reactContext ?: return@AsyncFunction false

            // Write config to SharedPreferences for native service
            val prefs = context.getSharedPreferences(SmsGatewayService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString("api_url", apiUrl)
                .putString("api_key", apiKey)
                .putBoolean("sms_service_enabled", serviceEnabled)
                .putLong("sms_polling_interval", pollingInterval.toLong())
                .putLong("heartbeat_interval", heartbeatInterval.toLong())
                .apply()

            SmsGatewayService.start(context)
            return@AsyncFunction true
        }

        /**
         * Stop the foreground service.
         */
        AsyncFunction("stopService") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            SmsGatewayService.stop(context)
            return@AsyncFunction true
        }

        /**
         * Check if the service is currently running.
         */
        AsyncFunction("isRunning") {
            return@AsyncFunction SmsGatewayService.isRunning
        }

        /**
         * Get service status (for UI display).
         */
        AsyncFunction("getStatus") {
            val context = appContext.reactContext
            val fcmToken = context?.getSharedPreferences(
                SmsGatewayService.PREFS_NAME, Context.MODE_PRIVATE
            )?.getString("fcm_token", "") ?: ""

            return@AsyncFunction mapOf(
                "isRunning" to SmsGatewayService.isRunning,
                "lastPollTime" to SmsGatewayService.lastPollTime,
                "lastHeartbeatTime" to SmsGatewayService.lastHeartbeatTime,
                "pendingCount" to SmsGatewayService.pendingCount,
                "sentToday" to SmsGatewayService.sentToday,
                "sentMonth" to SmsGatewayService.sentMonth,
                "sentTotal" to SmsGatewayService.sentTotal,
                "dailyLimit" to SmsGatewayService.dailyLimit,
                "monthlyLimit" to SmsGatewayService.monthlyLimit,
                "sessionSentCount" to SmsGatewayService.sessionSentCount,
                "sessionErrorCount" to SmsGatewayService.sessionErrorCount,
                "fcmToken" to fcmToken,
            )
        }

        /**
         * Get the current FCM token for this device.
         * Returns null if Firebase is not available.
         */
        AsyncFunction("getFcmToken") {
            try {
                val token = Tasks.await(FirebaseMessaging.getInstance().token)
                return@AsyncFunction token
            } catch (e: Exception) {
                return@AsyncFunction null
            }
        }

        /**
         * Update service config and restart schedulers.
         */
        AsyncFunction("updateConfig") { apiUrl: String, apiKey: String, serviceEnabled: Boolean, pollingInterval: Int, heartbeatInterval: Int ->
            val context = appContext.reactContext ?: return@AsyncFunction false

            val prefs = context.getSharedPreferences(SmsGatewayService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString("api_url", apiUrl)
                .putString("api_key", apiKey)
                .putBoolean("sms_service_enabled", serviceEnabled)
                .putLong("sms_polling_interval", pollingInterval.toLong())
                .putLong("heartbeat_interval", heartbeatInterval.toLong())
                .apply()

            if (SmsGatewayService.isRunning) {
                val intent = Intent(context, SmsGatewayService::class.java).apply {
                    action = SmsGatewayService.ACTION_UPDATE_CONFIG
                }
                context.startService(intent)
            }

            return@AsyncFunction true
        }

        /**
         * Check if battery optimization is disabled for this app.
         */
        AsyncFunction("isBatteryOptimizationDisabled") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                return@AsyncFunction pm.isIgnoringBatteryOptimizations(context.packageName)
            }
            return@AsyncFunction true // pre-M doesn't have this
        }

        /**
         * Reset the retroactive inbound check timestamp and trigger a rescan.
         * This causes the service to re-read the SMS inbox (last 30 days)
         * and send all messages to the server.
         */
        AsyncFunction("rescanInbox") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            val prefs = context.getSharedPreferences(SmsGatewayService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().remove("last_stop_check_timestamp").apply()
            if (SmsGatewayService.isRunning) {
                val intent = Intent(context, SmsGatewayService::class.java).apply {
                    action = SmsGatewayService.ACTION_RESCAN_INBOX
                }
                context.startService(intent)
            }
            return@AsyncFunction true
        }

        /**
         * Request battery optimization exemption.
         * Opens system dialog asking user to disable battery optimization for this app.
         */
        AsyncFunction("requestBatteryOptimizationExemption") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                if (!pm.isIgnoringBatteryOptimizations(context.packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return@AsyncFunction true
                }
            }
            return@AsyncFunction false // already exempt or pre-M
        }
    }

    private fun registerStatusReceiver() {
        val context = appContext.reactContext ?: return
        statusReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != SmsGatewayService.ACTION_STATUS_CHANGED) return
                try {
                    val fcmToken = ctx.getSharedPreferences(
                        SmsGatewayService.PREFS_NAME, Context.MODE_PRIVATE
                    )?.getString("fcm_token", "") ?: ""

                    sendEvent("onStatusChange", mapOf(
                        "isRunning" to intent.getBooleanExtra("isRunning", false),
                        "pendingCount" to intent.getIntExtra("pendingCount", 0),
                        "sentToday" to intent.getIntExtra("sentToday", 0),
                        "sentMonth" to intent.getIntExtra("sentMonth", 0),
                        "sentTotal" to intent.getIntExtra("sentTotal", 0),
                        "dailyLimit" to intent.getIntExtra("dailyLimit", 0),
                        "monthlyLimit" to intent.getIntExtra("monthlyLimit", 0),
                        "sessionSentCount" to intent.getIntExtra("sessionSentCount", 0),
                        "sessionErrorCount" to intent.getIntExtra("sessionErrorCount", 0),
                        "lastPollTime" to intent.getLongExtra("lastPollTime", 0),
                        "lastHeartbeatTime" to intent.getLongExtra("lastHeartbeatTime", 0),
                        "fcmToken" to fcmToken,
                    ))
                } catch (_: Exception) {}
            }
        }
        val filter = IntentFilter(SmsGatewayService.ACTION_STATUS_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(statusReceiver, filter)
        }
    }

    private fun unregisterStatusReceiver() {
        val context = appContext.reactContext ?: return
        statusReceiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
        }
        statusReceiver = null
    }
}
