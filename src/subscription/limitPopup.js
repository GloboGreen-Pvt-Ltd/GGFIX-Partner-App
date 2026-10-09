/**
 * The one subscription-limit dialog.
 *
 * Every blocked action routes through here so the wording, the usage line and
 * the Upgrade/Cancel buttons are identical whether the block came from a
 * pre-emptive client check or from a 409 the server returned. Two dialogs that
 * say nearly the same thing are how a product ends up telling a user "3 of 3"
 * in one place and "limit reached" in another.
 */

import { confirm } from '../components/confirm';
import { FEATURE, limitMessage, limitOf, isExpired } from './entitlements';

const TITLES = {
  [FEATURE.EMPLOYEES]: 'Employee Limit Reached',
  [FEATURE.SHOPS]: 'Shop Limit Reached',
  [FEATURE.SELL_ORDERS]: 'Sell Order Limit Reached',
};

/**
 * Show the limit dialog and route to the Subscription screen if the user
 * accepts.
 *
 * @param navigation  React Navigation object
 * @param feature     one of FEATURE.*
 * @param entitlements the current payload (may be null when blocking off a 409)
 * @param rejection   a 409 body (err.payload), when the block came from the API
 * @returns true if the user chose to upgrade
 */
export async function showLimitPopup(navigation, feature, entitlements, rejection) {
  const expired = isExpired(entitlements) || rejection?.expired === true;
  const usage = limitOf(entitlements, feature);

  // Prefer the server's live numbers from a rejection; fall back to the
  // entitlements payload when we blocked before making a request.
  const used = rejection?.currentUsage ?? usage?.used;
  const limit = rejection?.limit ?? usage?.limit;

  const lines = [limitMessage(entitlements, feature, rejection)];
  if (!expired && used != null && limit != null) {
    lines.push('', `Current usage:\n${used} / ${limit}`);
  }
  lines.push('', 'Upgrade your subscription to continue.');

  const ok = await confirm({
    title: expired ? 'Subscription Expired' : (TITLES[feature] || 'Subscription Limit Reached'),
    message: lines.join('\n'),
    confirmText: 'Upgrade Plan',
    cancelText: 'Cancel',
  });
  if (ok) navigation?.navigate?.('OwnerSubscription');
  return ok;
}

/**
 * Handle a caught error that may be a subscription refusal.
 *
 * @returns true when it was handled here, so callers can `if (await
 *          handleLimitError(...)) return;` and leave their generic error path
 *          for genuine failures.
 */
export async function handleLimitError(navigation, feature, error, entitlements) {
  if (error?.status !== 409) return false;
  await showLimitPopup(navigation, feature, entitlements, error?.payload);
  return true;
}
