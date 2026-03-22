package expo.modules.gatewayservice

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * WorkManager Worker that reports inbound SMS to the Odoo server.
 * Using WorkManager guarantees delivery even in Doze mode on MIUI/Xiaomi,
 * with automatic retries on network failure.
 */
class InboundSmsWorker(appContext: Context, workerParams: WorkerParameters) : Worker(appContext, workerParams) {

    companion object {
        private const val TAG = "InboundSmsWorker"
    }

    override fun doWork(): Result {
        val from = inputData.getString("from") ?: return Result.failure()
        val message = inputData.getString("message") ?: return Result.failure()
        val to = inputData.getString("to") ?: ""

        val prefs = applicationContext.getSharedPreferences(
            SmsGatewayService.PREFS_NAME, Context.MODE_PRIVATE
        )
        val apiUrl = prefs.getString("api_url", "") ?: ""
        val apiKey = prefs.getString("api_key", "") ?: ""

        if (apiUrl.isEmpty() || apiKey.isEmpty()) {
            Log.w(TAG, "API not configured, cannot report inbound SMS")
            return Result.failure()
        }

        return try {
            val body = JSONObject().apply {
                put("from_number", from)
                put("message", message)
                put("to_number", to)
            }

            val connection = URL("$apiUrl/sms-gateway/inbound").openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-API-Key", apiKey)
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.doOutput = true

            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(body.toString())
            }

            val responseCode = connection.responseCode
            connection.disconnect()

            if (responseCode in 200..299) {
                Log.i(TAG, "Inbound SMS from $from reported to server")
                Result.success()
            } else {
                Log.w(TAG, "Server returned $responseCode, will retry")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to report inbound SMS, will retry", e)
            Result.retry()
        }
    }
}
