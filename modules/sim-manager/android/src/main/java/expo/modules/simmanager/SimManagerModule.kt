package expo.modules.simmanager

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SimManagerModule : Module() {
    companion object {
        private const val TAG = "SimManagerModule"
    }

    override fun definition() = ModuleDefinition {
        Name("SimManager")

        // Check if phone permissions are granted
        AsyncFunction("hasPhonePermission") {
            val context = appContext.reactContext ?: return@AsyncFunction false

            val readPhoneState = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED

            // READ_PHONE_NUMBERS is required on Android 11+ for getting phone numbers
            val readPhoneNumbers = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.READ_PHONE_NUMBERS
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }

            readPhoneState && readPhoneNumbers
        }

        // Get list of active SIM cards
        AsyncFunction("getActiveSimCards") {
            val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()

            if (!hasPermission(context)) {
                Log.w(TAG, "Missing phone permission")
                return@AsyncFunction emptyList<Map<String, Any?>>()
            }

            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            if (subscriptionManager == null) {
                Log.w(TAG, "SubscriptionManager not available")
                return@AsyncFunction emptyList<Map<String, Any?>>()
            }

            try {
                val activeSubscriptions = subscriptionManager.activeSubscriptionInfoList ?: emptyList()

                activeSubscriptions.map { info ->
                    val phoneNumber = getPhoneNumber(context, info)
                    mapOf(
                        "subscriptionId" to info.subscriptionId,
                        "slotIndex" to info.simSlotIndex,
                        "phoneNumber" to phoneNumber,
                        "carrierName" to info.carrierName?.toString(),
                        "displayName" to info.displayName?.toString()
                    )
                }.also { simList ->
                    Log.d(TAG, "Found ${simList.size} active SIM(s)")
                    simList.forEach { sim ->
                        Log.d(TAG, "  SIM ${(sim["slotIndex"] as Int) + 1}: ${sim["phoneNumber"] ?: "no number"} (${sim["carrierName"]})")
                    }
                }
            } catch (e: SecurityException) {
                Log.e(TAG, "Security exception reading SIM info", e)
                emptyList<Map<String, Any?>>()
            } catch (e: Exception) {
                Log.e(TAG, "Error reading SIM info", e)
                emptyList<Map<String, Any?>>()
            }
        }

        // Get SIM by subscription ID
        AsyncFunction("getSimBySubscriptionId") { subscriptionId: Int ->
            val context = appContext.reactContext ?: return@AsyncFunction null

            if (!hasPermission(context)) {
                return@AsyncFunction null
            }

            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                ?: return@AsyncFunction null

            try {
                val activeSubscriptions = subscriptionManager.activeSubscriptionInfoList ?: emptyList()
                val info = activeSubscriptions.find { it.subscriptionId == subscriptionId }
                    ?: return@AsyncFunction null

                mapOf(
                    "subscriptionId" to info.subscriptionId,
                    "slotIndex" to info.simSlotIndex,
                    "phoneNumber" to getPhoneNumber(context, info),
                    "carrierName" to info.carrierName?.toString(),
                    "displayName" to info.displayName?.toString()
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error getting SIM by subscription ID", e)
                null
            }
        }
    }

    /**
     * Get phone number for a SIM subscription.
     * Uses the same simple approach as branch-app (info.number).
     */
    private fun getPhoneNumber(context: Context, info: SubscriptionInfo): String? {
        // Simply return the number from SubscriptionInfo
        val number = info.number
        if (!number.isNullOrBlank()) {
            Log.d(TAG, "Got phone number from SubscriptionInfo: ${number.take(4)}...")
            return number
        }

        Log.w(TAG, "No phone number available for subscription ${info.subscriptionId}")
        return null
    }

    private fun hasPermission(context: Context): Boolean {
        val readPhoneState = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED

        val readPhoneNumbers = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_NUMBERS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        return readPhoneState && readPhoneNumbers
    }
}
