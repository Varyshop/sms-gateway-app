package expo.modules.smsreceiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsReceiverModule : Module() {
    private var smsReceiver: BroadcastReceiver? = null

    override fun definition() = ModuleDefinition {
        Name("SmsReceiver")

        Events("onSmsReceived")

        AsyncFunction("startListening") {
            val context = appContext.reactContext ?: return@AsyncFunction false

            if (smsReceiver != null) {
                return@AsyncFunction true // Already listening
            }

            smsReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

                    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                    if (messages.isNullOrEmpty()) return

                    // Group message parts by sender
                    val grouped = mutableMapOf<String, StringBuilder>()
                    var toNumber = ""

                    for (msg in messages) {
                        val from = msg.originatingAddress ?: continue
                        grouped.getOrPut(from) { StringBuilder() }.append(msg.messageBody ?: "")

                        // Try to get the receiving number from subscription info
                        if (toNumber.isEmpty()) {
                            val subId = intent.extras?.getInt("subscription", -1) ?: -1
                            if (subId >= 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                                try {
                                    val subManager = android.telephony.SubscriptionManager.from(context)
                                    val subInfo = subManager.getActiveSubscriptionInfo(subId)
                                    toNumber = subInfo?.number ?: ""
                                } catch (_: SecurityException) { }
                            }
                        }
                    }

                    for ((from, body) in grouped) {
                        val event = Bundle().apply {
                            putString("from", from)
                            putString("message", body.toString())
                            putString("to", toNumber)
                        }
                        sendEvent("onSmsReceived", event)
                    }
                }
            }

            val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
            filter.priority = IntentFilter.SYSTEM_HIGH_PRIORITY
            context.registerReceiver(smsReceiver, filter)

            return@AsyncFunction true
        }

        AsyncFunction("stopListening") {
            val context = appContext.reactContext ?: return@AsyncFunction null
            smsReceiver?.let {
                try {
                    context.unregisterReceiver(it)
                } catch (_: Exception) { }
                smsReceiver = null
            }
        }

        OnDestroy {
            val context = appContext.reactContext ?: return@OnDestroy
            smsReceiver?.let {
                try {
                    context.unregisterReceiver(it)
                } catch (_: Exception) { }
                smsReceiver = null
            }
        }
    }
}
