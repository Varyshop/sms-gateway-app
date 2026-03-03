package expo.modules.directsms

import android.Manifest
import android.content.pm.PackageManager
import android.provider.Settings
import android.telephony.SmsManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException

class DirectSmsModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("DirectSms")

        // Check if SMS permission is granted
        AsyncFunction("hasPermission") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            val result = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.SEND_SMS
            ) == PackageManager.PERMISSION_GRANTED
            result
        }

        // Send SMS directly without opening SMS app
        AsyncFunction("sendSms") { phoneNumber: String, message: String, promise: Promise ->
            val context = appContext.reactContext
            if (context == null) {
                promise.reject(CodedException("ERR_CONTEXT", "React context is null", null))
                return@AsyncFunction
            }

            // Check permission
            if (ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.SEND_SMS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                promise.reject(CodedException("ERR_PERMISSION", "SEND_SMS permission not granted", null))
                return@AsyncFunction
            }

            try {
                val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    context.getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }

                // Split message if it's too long (SMS limit is 160 chars for single part)
                val parts = smsManager.divideMessage(message)

                if (parts.size == 1) {
                    smsManager.sendTextMessage(phoneNumber, null, message, null, null)
                } else {
                    smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
                }

                promise.resolve(mapOf(
                    "success" to true,
                    "message" to "SMS sent successfully"
                ))
            } catch (e: Exception) {
                promise.reject(CodedException("ERR_SEND_SMS", "Failed to send SMS: ${e.message}", e))
            }
        }

        // Read current Android SMS outgoing check settings
        AsyncFunction("getSmsCheckSettings") { promise: Promise ->
            val context = appContext.reactContext
            if (context == null) {
                promise.reject(CodedException("ERR_CONTEXT", "React context is null", null))
                return@AsyncFunction
            }

            try {
                val resolver = context.contentResolver
                val maxCount = Settings.Global.getInt(resolver, "sms_outgoing_check_max_count", 30)
                val intervalMs = Settings.Global.getLong(resolver, "sms_outgoing_check_interval_ms", 1800000L)

                promise.resolve(mapOf(
                    "maxCount" to maxCount,
                    "intervalMs" to intervalMs
                ))
            } catch (e: Exception) {
                promise.reject(CodedException("ERR_READ_SETTINGS", "Failed to read SMS check settings: ${e.message}", e))
            }
        }

        // Set Android SMS outgoing check settings (requires WRITE_SECURE_SETTINGS granted via ADB)
        AsyncFunction("setSmsCheckSettings") { maxCount: Int, intervalMs: Long, promise: Promise ->
            val context = appContext.reactContext
            if (context == null) {
                promise.reject(CodedException("ERR_CONTEXT", "React context is null", null))
                return@AsyncFunction
            }

            try {
                val resolver = context.contentResolver
                Settings.Global.putInt(resolver, "sms_outgoing_check_max_count", maxCount)
                Settings.Global.putLong(resolver, "sms_outgoing_check_interval_ms", intervalMs)

                promise.resolve(mapOf(
                    "success" to true,
                    "maxCount" to maxCount,
                    "intervalMs" to intervalMs
                ))
            } catch (e: SecurityException) {
                promise.reject(CodedException(
                    "ERR_PERMISSION",
                    "WRITE_SECURE_SETTINGS not granted. Run: adb shell pm grant ${context.packageName} android.permission.WRITE_SECURE_SETTINGS",
                    e
                ))
            } catch (e: Exception) {
                promise.reject(CodedException("ERR_WRITE_SETTINGS", "Failed to set SMS check settings: ${e.message}", e))
            }
        }
    }
}
