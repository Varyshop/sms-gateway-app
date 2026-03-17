package expo.modules.gatewayservice

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class GatewayServiceModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("GatewayService")

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
                "sessionErrorCount" to SmsGatewayService.sessionErrorCount
            )
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
}
