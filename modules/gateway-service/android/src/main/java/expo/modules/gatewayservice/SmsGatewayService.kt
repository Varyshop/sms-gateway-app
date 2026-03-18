package expo.modules.gatewayservice

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Android Foreground Service that keeps SMS gateway running even when
 * the screen is off or the app is in the background.
 *
 * Handles:
 * - Polling server for pending SMS and sending them
 * - Tracking actual SMS delivery via SentReceiver/DeliveredReceiver PendingIntents
 * - Sending heartbeat to server
 * - Processing inbound SMS forwarded by SmsBroadcastReceiver
 * - Retroactive STOP blacklist check on startup
 */
class SmsGatewayService : Service() {

    companion object {
        private const val TAG = "SmsGatewayService"
        const val CHANNEL_ID = "sms_gateway_channel"
        const val NOTIFICATION_ID = 1
        const val ACTION_START = "expo.modules.gatewayservice.START_SERVICE"
        const val ACTION_STOP = "expo.modules.gatewayservice.STOP_SERVICE"
        const val ACTION_INBOUND_SMS = "expo.modules.gatewayservice.INBOUND_SMS"
        const val ACTION_UPDATE_CONFIG = "expo.modules.gatewayservice.UPDATE_CONFIG"
        const val ACTION_SMS_SENT = "expo.modules.gatewayservice.SMS_SENT"
        const val ACTION_SMS_DELIVERED = "expo.modules.gatewayservice.SMS_DELIVERED"
        const val ACTION_FCM_WAKE = "expo.modules.gatewayservice.FCM_WAKE"
        const val ACTION_REGISTER_FCM = "expo.modules.gatewayservice.REGISTER_FCM"
        const val ACTION_STATUS_CHANGED = "expo.modules.gatewayservice.STATUS_CHANGED"
        const val EXTRA_SMS_ID = "sms_id"
        const val EXTRA_PART_INDEX = "part_index"
        const val EXTRA_TOTAL_PARTS = "total_parts"
        const val PREFS_NAME = "SmsGatewayPrefs"

        @Volatile
        var isRunning = false
            private set

        @Volatile
        var lastPollTime: Long = 0
            private set

        @Volatile
        var lastHeartbeatTime: Long = 0
            private set

        @Volatile
        var pendingCount: Int = 0
            private set

        // Server-synced counters (persisted in SharedPreferences)
        @Volatile
        var sentToday: Int = 0
            private set

        @Volatile
        var sentMonth: Int = 0
            private set

        @Volatile
        var sentTotal: Int = 0
            private set

        @Volatile
        var dailyLimit: Int = 0
            private set

        @Volatile
        var monthlyLimit: Int = 0
            private set

        @Volatile
        var sessionSentCount: Int = 0
            private set

        @Volatile
        var sessionErrorCount: Int = 0
            private set

        fun start(context: Context) {
            val intent = Intent(context, SmsGatewayService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, SmsGatewayService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }

        fun reportInboundSms(context: Context, from: String, message: String, to: String) {
            val intent = Intent(context, SmsGatewayService::class.java).apply {
                action = ACTION_INBOUND_SMS
                putExtra("from", from)
                putExtra("message", message)
                putExtra("to", to)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        /**
         * Trigger an immediate poll cycle from an FCM wake signal.
         * Called by FcmMessageHandler when a data message arrives.
         */
        fun triggerImmediatePoll(context: Context) {
            val intent = Intent(context, SmsGatewayService::class.java).apply {
                action = ACTION_FCM_WAKE
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        /**
         * Register a new FCM token with the Odoo server.
         * Called by FcmMessageHandler.onNewToken when the token rotates.
         */
        fun registerFcmToken(context: Context, token: String) {
            val intent = Intent(context, SmsGatewayService::class.java).apply {
                action = ACTION_REGISTER_FCM
                putExtra("fcm_token", token)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    /**
     * Broadcast status change to GatewayServiceModule → JS EventEmitter.
     * Uses an explicit broadcast so the Expo module can pick it up.
     */
    private fun broadcastStatusChange() {
        try {
            val intent = Intent(ACTION_STATUS_CHANGED).apply {
                putExtra("isRunning", isRunning)
                putExtra("pendingCount", pendingCount)
                putExtra("sentToday", sentToday)
                putExtra("sentMonth", sentMonth)
                putExtra("sentTotal", sentTotal)
                putExtra("dailyLimit", dailyLimit)
                putExtra("monthlyLimit", monthlyLimit)
                putExtra("sessionSentCount", sessionSentCount)
                putExtra("sessionErrorCount", sessionErrorCount)
                putExtra("lastPollTime", lastPollTime)
                putExtra("lastHeartbeatTime", lastHeartbeatTime)
                setPackage(packageName)
            }
            sendBroadcast(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to broadcast status change", e)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var scheduler: ScheduledExecutorService? = null
    private var pollFuture: ScheduledFuture<*>? = null
    private var heartbeatFuture: ScheduledFuture<*>? = null
    private val executor = Executors.newSingleThreadExecutor()

    private lateinit var prefs: SharedPreferences

    private val apiUrl: String get() = prefs.getString("api_url", "") ?: ""
    private val apiKey: String get() = prefs.getString("api_key", "") ?: ""
    private val pollingIntervalSec: Long get() = prefs.getLong("sms_polling_interval", 10)
    private val heartbeatIntervalSec: Long get() = prefs.getLong("heartbeat_interval", 60)
    private var rateLimit: Int = 100

    // Delivery tracking: smsId -> DeliveryTracker
    private val deliveryTrackers = ConcurrentHashMap<Int, DeliveryTracker>()
    private val pendingIntentCounter = AtomicInteger(0)

    // Broadcast receivers for sent/delivered status
    private var sentReceiver: BroadcastReceiver? = null
    private var deliveredReceiver: BroadcastReceiver? = null

    /**
     * Tracks delivery status for a multipart SMS.
     * Only reports to batch when all parts have reported.
     */
    private data class DeliveryTracker(
        val smsId: Int,
        val totalParts: Int,
        var sentParts: Int = 0,
        var failedParts: Int = 0,
        var deliveredParts: Int = 0,
        var failReason: String? = null
    ) {
        val allPartsSent: Boolean get() = (sentParts + failedParts) >= totalParts
        val isSentOk: Boolean get() = sentParts == totalParts
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startGateway()
            ACTION_STOP -> stopGateway()
            ACTION_INBOUND_SMS -> {
                val from = intent.getStringExtra("from") ?: return START_STICKY
                val message = intent.getStringExtra("message") ?: return START_STICKY
                val to = intent.getStringExtra("to") ?: ""
                executor.execute { reportInboundSmsToServer(from, message, to) }
            }
            ACTION_UPDATE_CONFIG -> {
                restartSchedulers()
            }
            ACTION_FCM_WAKE -> {
                Log.i(TAG, "FCM wake received, triggering immediate poll")
                executor.execute { pollAndSend() }
            }
            ACTION_REGISTER_FCM -> {
                val token = intent.getStringExtra("fcm_token") ?: return START_STICKY
                executor.execute { registerFcmTokenToServer(token) }
            }
            else -> startGateway()
        }
        return START_STICKY
    }

    private fun loadPersistedCounters() {
        sentToday = prefs.getInt("counter_sent_today", 0)
        sentMonth = prefs.getInt("counter_sent_month", 0)
        sentTotal = prefs.getInt("counter_sent_total", 0)
        dailyLimit = prefs.getInt("counter_daily_limit", 0)
        monthlyLimit = prefs.getInt("counter_monthly_limit", 0)
        Log.d(TAG, "Loaded persisted counters: today=$sentToday, month=$sentMonth, total=$sentTotal")
    }

    private fun persistCounters() {
        prefs.edit()
            .putInt("counter_sent_today", sentToday)
            .putInt("counter_sent_month", sentMonth)
            .putInt("counter_sent_total", sentTotal)
            .putInt("counter_daily_limit", dailyLimit)
            .putInt("counter_monthly_limit", monthlyLimit)
            .apply()
    }

    private fun startGateway() {
        if (isRunning) {
            Log.d(TAG, "Service already running")
            return
        }

        Log.i(TAG, "Starting SMS Gateway Service")

        loadPersistedCounters()

        // Acquire partial wake lock to keep CPU running
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "SmsGateway::BackgroundWork"
        ).apply {
            acquire()
        }

        // Start as foreground service with persistent notification
        startForeground(NOTIFICATION_ID, buildNotification(
            "Naslouchám příchozím a odchozím SMS na pozadí"
        ))

        // Register sent/delivered broadcast receivers
        registerSmsReceivers()

        isRunning = true
        startSchedulers()

        // Register FCM token with server
        obtainAndRegisterFcmToken()

        // Retroactive STOP check
        executor.execute { retroactiveStopCheck() }
    }

    private fun stopGateway() {
        Log.i(TAG, "Stopping SMS Gateway Service")
        isRunning = false

        pollFuture?.cancel(false)
        heartbeatFuture?.cancel(false)
        scheduler?.shutdown()
        scheduler = null

        unregisterSmsReceivers()

        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ---- SMS Sent/Delivered Receivers ----

    private fun registerSmsReceivers() {
        // SentReceiver — tracks whether SmsManager accepted the SMS
        sentReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val smsId = intent.getIntExtra(EXTRA_SMS_ID, -1)
                val partIndex = intent.getIntExtra(EXTRA_PART_INDEX, 0)
                val totalParts = intent.getIntExtra(EXTRA_TOTAL_PARTS, 1)
                if (smsId == -1) return

                val tracker = deliveryTrackers.getOrPut(smsId) {
                    DeliveryTracker(smsId, totalParts)
                }

                when (resultCode) {
                    Activity.RESULT_OK -> {
                        tracker.sentParts++
                        Log.d(TAG, "SMS $smsId part ${partIndex + 1}/$totalParts: SENT OK")
                    }
                    else -> {
                        tracker.failedParts++
                        tracker.failReason = getSmsErrorReason(resultCode)
                        Log.w(TAG, "SMS $smsId part ${partIndex + 1}/$totalParts: SEND FAILED (${tracker.failReason})")
                    }
                }

                // When all parts have reported, finalize
                if (tracker.allPartsSent) {
                    finalizeSmsDelivery(tracker)
                }
            }
        }

        // DeliveredReceiver — tracks actual carrier delivery confirmation
        deliveredReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val smsId = intent.getIntExtra(EXTRA_SMS_ID, -1)
                if (smsId == -1) return

                val tracker = deliveryTrackers[smsId]
                if (tracker != null) {
                    when (resultCode) {
                        Activity.RESULT_OK -> {
                            tracker.deliveredParts++
                            Log.d(TAG, "SMS $smsId: DELIVERED confirmation")
                        }
                        else -> {
                            Log.d(TAG, "SMS $smsId: delivery status $resultCode (not delivered yet)")
                        }
                    }
                }
            }
        }

        val sentFilter = IntentFilter(ACTION_SMS_SENT)
        val deliveredFilter = IntentFilter(ACTION_SMS_DELIVERED)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(sentReceiver, sentFilter, RECEIVER_NOT_EXPORTED)
            registerReceiver(deliveredReceiver, deliveredFilter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(sentReceiver, sentFilter)
            registerReceiver(deliveredReceiver, deliveredFilter)
        }
        Log.i(TAG, "Registered SMS sent/delivered receivers")
    }

    private fun unregisterSmsReceivers() {
        try {
            sentReceiver?.let { unregisterReceiver(it) }
            deliveredReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {}
        sentReceiver = null
        deliveredReceiver = null
    }

    private fun getSmsErrorReason(resultCode: Int): String {
        return when (resultCode) {
            SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "GENERIC_FAILURE"
            SmsManager.RESULT_ERROR_NO_SERVICE -> "NO_SERVICE"
            SmsManager.RESULT_ERROR_NULL_PDU -> "NULL_PDU"
            SmsManager.RESULT_ERROR_RADIO_OFF -> "RADIO_OFF"
            SmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED -> "SHORT_CODE_NOT_ALLOWED"
            SmsManager.RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED -> "SHORT_CODE_NEVER_ALLOWED"
            else -> "UNKNOWN_ERROR_$resultCode"
        }
    }

    /**
     * Called when all parts of an SMS have been processed by SmsManager.
     * Adds the result to the batch queue for server confirmation.
     */
    private fun finalizeSmsDelivery(tracker: DeliveryTracker) {
        deliveryTrackers.remove(tracker.smsId)

        if (tracker.isSentOk) {
            sessionSentCount++
            Log.i(TAG, "SMS ${tracker.smsId}: all ${tracker.totalParts} parts sent OK")
            addToBatchQueue(tracker.smsId, "sent", null)
        } else {
            sessionErrorCount++
            val reason = tracker.failReason ?: "PARTIAL_FAILURE"
            Log.e(TAG, "SMS ${tracker.smsId}: ${tracker.failedParts}/${tracker.totalParts} parts failed: $reason")
            addToBatchQueue(tracker.smsId, "error", reason)
        }
        broadcastStatusChange()
    }

    // ---- Batch Queue for Server Confirmation ----

    private val batchQueue = java.util.concurrent.ConcurrentLinkedQueue<JSONObject>()
    private var batchFlushFuture: ScheduledFuture<*>? = null

    private fun addToBatchQueue(smsId: Int, status: String, errorMessage: String?) {
        batchQueue.add(JSONObject().apply {
            put("id", smsId)
            put("status", status)
            if (errorMessage != null) put("error_message", errorMessage)
        })
    }

    private fun flushBatchQueue() {
        if (batchQueue.isEmpty()) return
        try {
            val url = apiUrl
            val key = apiKey
            if (url.isEmpty() || key.isEmpty()) return

            val results = JSONArray()
            var item = batchQueue.poll()
            while (item != null) {
                results.put(item)
                item = batchQueue.poll()
            }

            if (results.length() == 0) return

            Log.i(TAG, "Flushing batch queue: ${results.length()} results")
            confirmBatch(url, key, results)
            updateNotification()
        } catch (e: Exception) {
            Log.e(TAG, "Batch queue flush error", e)
        }
    }

    // ---- Schedulers ----

    private fun startSchedulers() {
        scheduler = Executors.newScheduledThreadPool(3)

        // When FCM token is present, polling is only a fallback (5 min).
        // Old app versions without FCM keep the configured interval (default 10s).
        val hasFcmToken = !prefs.getString("fcm_token", "").isNullOrEmpty()
        val pollInterval = if (hasFcmToken) {
            pollingIntervalSec.coerceAtLeast(300)  // 5 min fallback with FCM
        } else {
            pollingIntervalSec.coerceAtLeast(5)    // Legacy polling mode
        }
        pollFuture = scheduler?.scheduleWithFixedDelay(
            { pollAndSend() },
            0,
            pollInterval,
            TimeUnit.SECONDS
        )

        val hbInterval = heartbeatIntervalSec.coerceAtLeast(30)
        heartbeatFuture = scheduler?.scheduleWithFixedDelay(
            { sendHeartbeat() },
            5,
            hbInterval,
            TimeUnit.SECONDS
        )

        // Flush batch queue every 3 seconds
        batchFlushFuture = scheduler?.scheduleWithFixedDelay(
            { flushBatchQueue() },
            3,
            3,
            TimeUnit.SECONDS
        )

        Log.i(TAG, "Schedulers started: poll=${pollInterval}s, heartbeat=${hbInterval}s, batchFlush=3s")
    }

    private fun restartSchedulers() {
        pollFuture?.cancel(false)
        heartbeatFuture?.cancel(false)
        batchFlushFuture?.cancel(false)
        scheduler?.shutdown()
        scheduler = null
        startSchedulers()
    }

    // ---- Poll & Send ----

    private fun pollAndSend() {
        try {
            val url = apiUrl
            val key = apiKey
            if (url.isEmpty() || key.isEmpty()) {
                Log.w(TAG, "API not configured, skipping poll")
                return
            }

            val phoneNumbers = getPhoneNumbers()
            if (phoneNumbers.isEmpty()) {
                Log.w(TAG, "No phone numbers available")
                return
            }

            lastPollTime = System.currentTimeMillis()

            val requestBody = JSONObject().apply {
                put("phone_numbers", JSONArray(phoneNumbers))
                put("limit", 20)
            }

            val response = httpPost("$url/sms-gateway/pending", key, requestBody)
            if (response == null) {
                Log.e(TAG, "Poll request failed")
                return
            }

            val success = response.optBoolean("success", false)
            val smsList = response.optJSONArray("sms_list")

            if (!success || smsList == null || smsList.length() == 0) return

            val count = smsList.length()
            Log.i(TAG, "Found $count pending SMS")
            pendingCount = count
            broadcastStatusChange()

            val delayMs = if (rateLimit > 0) (60000L / rateLimit).coerceAtLeast(100) else 600L

            for (i in 0 until smsList.length()) {
                if (!isRunning) break

                val sms = smsList.getJSONObject(i)
                val smsId = sms.getInt("id")
                val phoneNumber = sms.getString("phone_number")
                val message = sms.getString("message")

                sendSingleSms(smsId, phoneNumber, message)

                if (i < smsList.length() - 1) {
                    Thread.sleep(delayMs)
                }
            }

            // After sending all, wait a bit for SentReceiver callbacks, then flush
            Thread.sleep(2000)
            flushBatchQueue()
            updateNotification()
        } catch (e: Exception) {
            Log.e(TAG, "Poll error", e)
        }
    }

    /**
     * Send a single SMS via Android SmsManager with PendingIntents for delivery tracking.
     */
    private fun sendSingleSms(smsId: Int, phoneNumber: String, message: String) {
        try {
            val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            val parts = smsManager.divideMessage(message)
            val totalParts = parts.size

            // Pre-create tracker
            deliveryTrackers[smsId] = DeliveryTracker(smsId, totalParts)

            if (totalParts == 1) {
                val sentPI = createSentPendingIntent(smsId, 0, 1)
                val deliveredPI = createDeliveredPendingIntent(smsId, 0, 1)
                smsManager.sendTextMessage(phoneNumber, null, message, sentPI, deliveredPI)
            } else {
                val sentPIs = ArrayList<PendingIntent>(totalParts)
                val deliveredPIs = ArrayList<PendingIntent>(totalParts)
                for (i in 0 until totalParts) {
                    sentPIs.add(createSentPendingIntent(smsId, i, totalParts))
                    deliveredPIs.add(createDeliveredPendingIntent(smsId, i, totalParts))
                }
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentPIs, deliveredPIs)
            }

            Log.d(TAG, "SMS $smsId: submitted $totalParts part(s) to SmsManager")
        } catch (e: Exception) {
            // SmsManager threw — immediately report error
            deliveryTrackers.remove(smsId)
            sessionErrorCount++
            val errorMessage = e.message ?: "Unknown error"
            Log.e(TAG, "Failed to submit SMS $smsId to SmsManager", e)
            addToBatchQueue(smsId, "error", errorMessage)
        }
    }

    private fun createSentPendingIntent(smsId: Int, partIndex: Int, totalParts: Int): PendingIntent {
        val intent = Intent(ACTION_SMS_SENT).apply {
            putExtra(EXTRA_SMS_ID, smsId)
            putExtra(EXTRA_PART_INDEX, partIndex)
            putExtra(EXTRA_TOTAL_PARTS, totalParts)
            // Use package to ensure only our receiver gets it
            setPackage(packageName)
        }
        val requestCode = pendingIntentCounter.getAndIncrement()
        return PendingIntent.getBroadcast(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun createDeliveredPendingIntent(smsId: Int, partIndex: Int, totalParts: Int): PendingIntent {
        val intent = Intent(ACTION_SMS_DELIVERED).apply {
            putExtra(EXTRA_SMS_ID, smsId)
            putExtra(EXTRA_PART_INDEX, partIndex)
            putExtra(EXTRA_TOTAL_PARTS, totalParts)
            setPackage(packageName)
        }
        val requestCode = pendingIntentCounter.getAndIncrement()
        return PendingIntent.getBroadcast(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    // ---- Batch Confirm ----

    private fun confirmBatch(apiUrl: String, apiKey: String, results: JSONArray) {
        try {
            val body = JSONObject().apply {
                put("results", results)
            }
            val response = httpPost("$apiUrl/sms-gateway/confirm-batch", apiKey, body)
            if (response != null && response.optBoolean("success", false)) {
                val processed = response.optInt("processed", 0)
                Log.i(TAG, "Batch confirmed: $processed SMS processed")

                if (response.has("sent_today")) {
                    sentToday = response.getInt("sent_today")
                    sentMonth = response.optInt("sent_month", sentMonth)
                    sentTotal = response.optInt("sent_total", sentTotal)
                    dailyLimit = response.optInt("daily_limit", dailyLimit)
                    monthlyLimit = response.optInt("monthly_limit", monthlyLimit)
                    persistCounters()
                    broadcastStatusChange()
                }

                val errors = response.optJSONArray("errors")
                if (errors != null && errors.length() > 0) {
                    Log.w(TAG, "Batch had ${errors.length()} server-side errors")
                }
            } else {
                Log.e(TAG, "Batch confirm failed, falling back to individual confirms")
                for (i in 0 until results.length()) {
                    val item = results.getJSONObject(i)
                    val smsId = item.getInt("id")
                    val status = item.getString("status")
                    val errorMsg = item.optString("error_message", null)
                    try {
                        val fallbackBody = JSONObject().apply {
                            put("status", status)
                            if (errorMsg != null) put("error_message", errorMsg)
                        }
                        httpPost("$apiUrl/sms-gateway/confirm/$smsId", apiKey, fallbackBody)
                    } catch (_: Exception) {
                        Log.e(TAG, "Fallback confirm also failed for SMS $smsId")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Batch confirm request failed", e)
        }
    }

    // ---- Heartbeat ----

    private fun sendHeartbeat() {
        try {
            val url = apiUrl
            val key = apiKey
            if (url.isEmpty() || key.isEmpty()) return

            val phoneNumbers = getPhoneNumbers()
            if (phoneNumbers.isEmpty()) return

            lastHeartbeatTime = System.currentTimeMillis()

            val body = JSONObject().apply {
                put("phone_numbers", JSONArray(phoneNumbers))
            }

            val response = httpPost("$url/sms-gateway/heartbeat", key, body)
            if (response != null) {
                val newRateLimit = response.optInt("rate_limit", rateLimit)
                if (newRateLimit > 0) rateLimit = newRateLimit

                val pending = response.optJSONObject("pending_count")
                if (pending != null) {
                    var total = 0
                    pending.keys().forEach { k -> total += pending.optInt(k, 0) }
                    pendingCount = total
                }

                val phoneStatsObj = response.optJSONObject("phone_stats")
                if (phoneStatsObj != null) {
                    val firstKey = phoneStatsObj.keys().asSequence().firstOrNull()
                    if (firstKey != null) {
                        val stats = phoneStatsObj.getJSONObject(firstKey)
                        sentToday = stats.optInt("sent_today", sentToday)
                        sentMonth = stats.optInt("sent_month", sentMonth)
                        sentTotal = stats.optInt("sent_total", sentTotal)
                        dailyLimit = stats.optInt("daily_limit", dailyLimit)
                        monthlyLimit = stats.optInt("monthly_limit", monthlyLimit)
                        persistCounters()
                    }
                }

                Log.d(TAG, "Heartbeat OK, pending=$pendingCount, today=$sentToday, month=$sentMonth, total=$sentTotal")
                broadcastStatusChange()

                // Safety net: if FCM push didn't arrive but server has pending SMS,
                // trigger a poll. This covers FCM misconfiguration or network issues.
                if (pendingCount > 0) {
                    val timeSinceLastPoll = System.currentTimeMillis() - lastPollTime
                    if (timeSinceLastPoll > heartbeatIntervalSec * 1000) {
                        Log.w(TAG, "FCM missed: $pendingCount pending, last poll ${timeSinceLastPoll}ms ago — triggering poll")
                        executor.execute { pollAndSend() }
                    }
                }
            }

            // Re-register FCM token periodically (every 10th heartbeat) for reliability
            heartbeatCount++
            if (heartbeatCount % 10 == 0) {
                val storedToken = prefs.getString("fcm_token", null)
                if (!storedToken.isNullOrEmpty()) {
                    registerFcmTokenToServer(storedToken)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat error", e)
        }
    }

    // ---- Inbound SMS ----

    private fun reportInboundSmsToServer(from: String, message: String, to: String) {
        try {
            val url = apiUrl
            val key = apiKey
            if (url.isEmpty() || key.isEmpty()) {
                Log.w(TAG, "API not configured, cannot report inbound SMS")
                return
            }

            val body = JSONObject().apply {
                put("from_number", from)
                put("message", message)
                put("to_number", to)
            }

            val response = httpPost("$url/sms-gateway/inbound", key, body)
            if (response != null) {
                val blacklisted = response.optBoolean("blacklisted", false)
                if (blacklisted) {
                    Log.i(TAG, "Inbound SMS from $from: added to blacklist (STOP)")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to report inbound SMS", e)
        }
    }

    // ---- FCM Token Registration ----

    @Volatile
    private var heartbeatCount = 0

    private fun registerFcmTokenToServer(token: String) {
        val url = apiUrl
        val key = apiKey
        if (url.isEmpty() || key.isEmpty()) return

        try {
            val body = JSONObject().apply {
                put("fcm_token", token)
            }
            val response = httpPost("$url/sms-gateway/register-fcm", key, body)
            if (response != null && response.optBoolean("success", false)) {
                Log.i(TAG, "FCM token registered with server")
            } else {
                Log.e(TAG, "Failed to register FCM token with server")
            }
        } catch (e: Exception) {
            Log.e(TAG, "FCM token registration error", e)
        }
    }

    private fun obtainAndRegisterFcmToken() {
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (token != null) {
                        prefs.edit().putString("fcm_token", token).apply()
                        executor.execute { registerFcmTokenToServer(token) }
                        Log.i(TAG, "FCM token obtained and registration queued")
                    }
                }
                .addOnFailureListener { e ->
                    Log.w(TAG, "Could not get FCM token: ${e.message}")
                }
        } catch (e: Exception) {
            Log.w(TAG, "Firebase not available, FCM disabled: ${e.message}")
        }
    }

    // ---- Retroactive STOP Check ----

    private fun retroactiveStopCheck() {
        try {
            val url = apiUrl
            val key = apiKey
            if (url.isEmpty() || key.isEmpty()) return

            val lastCheckTimestamp = prefs.getLong("last_stop_check_timestamp", 0)
            val since = if (lastCheckTimestamp > 0) lastCheckTimestamp
                        else System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000L

            val stopMessages = JSONArray()
            var cursor: Cursor? = null
            try {
                cursor = contentResolver.query(
                    Uri.parse("content://sms/inbox"),
                    arrayOf("address", "body", "date"),
                    "date > ? AND (body LIKE '%STOP%' OR body LIKE '%stop%' OR body LIKE '%Stop%')",
                    arrayOf(since.toString()),
                    "date ASC"
                )
                if (cursor != null) {
                    while (cursor.moveToNext()) {
                        val address = cursor.getString(0) ?: continue
                        val body = cursor.getString(1) ?: continue
                        if (body.uppercase().contains("STOP")) {
                            stopMessages.put(JSONObject().apply {
                                put("from_number", address)
                                put("message", body)
                                put("to_number", "")
                            })
                        }
                    }
                }
            } finally {
                cursor?.close()
            }

            if (stopMessages.length() == 0) {
                Log.d(TAG, "Retroactive STOP check: no STOP messages found since $since")
            } else {
                Log.i(TAG, "Retroactive STOP check: found ${stopMessages.length()} STOP messages, sending to server")
                val body = JSONObject().apply {
                    put("messages", stopMessages)
                }
                val response = httpPost("$url/sms-gateway/inbound-batch", key, body)
                if (response != null) {
                    val blacklisted = response.optInt("blacklisted", 0)
                    val already = response.optInt("already_blacklisted", 0)
                    Log.i(TAG, "Retroactive STOP check: blacklisted=$blacklisted, already=$already")
                }
            }

            prefs.edit().putLong("last_stop_check_timestamp", System.currentTimeMillis()).apply()
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot read SMS inbox for STOP check (no permission): ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Retroactive STOP check error", e)
        }
    }

    // ---- Utilities ----

    private fun getPhoneNumbers(): List<String> {
        val numbers = mutableListOf<String>()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                val subs = subManager?.activeSubscriptionInfoList ?: emptyList()
                for (sub in subs) {
                    val number = sub.number
                    if (!number.isNullOrBlank()) {
                        numbers.add(number)
                    }
                }
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Cannot read phone numbers: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "Error getting phone numbers", e)
        }
        return numbers
    }

    private fun httpPost(urlStr: String, apiKey: String, body: JSONObject): JSONObject? {
        var connection: HttpURLConnection? = null
        try {
            val url = URL(urlStr)
            connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("X-API-Key", apiKey)
            connection.connectTimeout = 30000
            connection.readTimeout = 30000
            connection.doOutput = true

            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(body.toString())
                writer.flush()
            }

            val responseCode = connection.responseCode
            if (responseCode in 200..299) {
                val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                return JSONObject(responseBody)
            } else {
                val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                Log.e(TAG, "HTTP $responseCode from $urlStr: $errorBody")
                return null
            }
        } catch (e: Exception) {
            Log.e(TAG, "HTTP request failed: $urlStr", e)
            return null
        } finally {
            connection?.disconnect()
        }
    }

    // ---- Notifications ----

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SMS Gateway",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "SMS Gateway naslouchá příchozím a odchozím SMS na pozadí"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SMS Gateway")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setOngoing(true)
            .apply { if (pendingIntent != null) setContentIntent(pendingIntent) }
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification() {
        val limitStr = if (dailyLimit > 0) "/$dailyLimit" else ""
        val text = "Naslouchám SMS | Dnes: $sentToday$limitStr | Měsíc: $sentMonth | Čeká: $pendingCount"
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }

    override fun onDestroy() {
        Log.i(TAG, "Service destroyed")
        isRunning = false
        pollFuture?.cancel(false)
        heartbeatFuture?.cancel(false)
        batchFlushFuture?.cancel(false)
        scheduler?.shutdown()
        unregisterSmsReceivers()
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }
}
