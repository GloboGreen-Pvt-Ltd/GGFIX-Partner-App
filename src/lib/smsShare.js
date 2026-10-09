// Open the SMS composer addressed to the customer with a message filled in.
// Same `sms:` link the Booking Successful screen builds: iOS separates the
// body with `&`, Android with `?`.
import { Linking, Platform } from 'react-native';
import { notify } from '../components/confirm';

/**
 * @param phone    customer mobile (may be empty — the composer then asks for one)
 * @param message  text to pre-fill
 */
export async function openSmsComposer({ phone, message }) {
  const sep = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${String(phone || '').replace(/[^\d+]/g, '')}${sep}body=${encodeURIComponent(message || '')}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      notify('SMS not available', 'Cannot open SMS on this device.');
      return;
    }
    await Linking.openURL(url);
  } catch (e) {
    notify('Send failed', e?.message || 'Try again');
  }
}
