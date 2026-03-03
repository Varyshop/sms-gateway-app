import { Platform } from 'react-native';
import { getApiClient } from '../api/gatewayClient';

// Note: This service requires the sms-receiver native module
// which listens for incoming SMS via Android's SMS_RECEIVED broadcast.
// For now, the native module emits events that this service handles.

let eventSubscription: { remove: () => void } | null = null;

/**
 * Handle an incoming SMS - check for STOP keyword and report to server
 */
async function handleIncomingSms(
  fromNumber: string,
  message: string,
  toNumber: string
): Promise<void> {
  const client = getApiClient();
  if (!client) return;

  try {
    const response = await client.reportInboundSms(fromNumber, message, toNumber);

    if (response.blacklisted) {
      console.log(`[InboundSms] ${fromNumber} added to blacklist (STOP)`);
    }
    if (response.partner_found) {
      console.log(`[InboundSms] Message logged to partner chatter`);
    }
  } catch (error) {
    console.error('[InboundSms] Failed to report:', error);
  }
}

/**
 * Start listening for incoming SMS
 * Note: Requires sms-receiver native module to emit events
 */
export async function startInboundSmsListener(): Promise<void> {
  if (Platform.OS !== 'android') return;

  stopInboundSmsListener();

  try {
    const SmsReceiver = require('../../modules/sms-receiver');
    if (SmsReceiver && SmsReceiver.addListener) {
      eventSubscription = SmsReceiver.addListener(
        'onSmsReceived',
        (event: { from: string; message: string; to: string }) => {
          handleIncomingSms(event.from, event.message, event.to);
        }
      );

      if (SmsReceiver.startListening) {
        await SmsReceiver.startListening();
      }

      console.log('[InboundSms] Listener started');
    }
  } catch (error) {
    console.warn('[InboundSms] sms-receiver module not available:', error);
  }
}

export async function stopInboundSmsListener(): Promise<void> {
  if (eventSubscription) {
    eventSubscription.remove();
    eventSubscription = null;
  }
  try {
    const SmsReceiver = require('../../modules/sms-receiver');
    if (SmsReceiver && SmsReceiver.stopListening) {
      await SmsReceiver.stopListening();
    }
  } catch (_) {}
}

// Export for manual testing / direct calls
export { handleIncomingSms };

export default {
  startInboundSmsListener,
  stopInboundSmsListener,
  handleIncomingSms,
};
