import { buildDeviceParams } from './deviceSearch';

/**
 * Repair / Sell / Buy for one catalogue device (a loadSearchableModels() row).
 * Shared by OwnerSearch's device sheet and the product camera, so both land
 * in the same flows:
 *   BOOK → DeviceColorStorage, nested inside the RepairServiceBookingShop
 *          navigator, so it goes through that route with `screen`/`params`.
 *   SELL → OwnerSellChooseSalesCategory (the OWNER_LIST flow).
 *   BUY  → the Buy listing (OwnerBuyListing), which takes a `q`; there is no
 *          per-model product route, so it lands pre-filtered on the model name.
 * Returns false (and does nothing) when the row has no catalogue model id.
 */
export function navigateDeviceAction(navigation, key, device) {
  if (!device?.modelId) return false;
  if (key === 'BOOK') {
    navigation.navigate('RepairServiceBookingShop', { screen: 'DeviceColorStorage', params: buildDeviceParams(device, 'BOOKING') });
    return true;
  }
  if (key === 'SELL') {
    navigation.navigate('OwnerSellChooseSalesCategory', buildDeviceParams(device, 'OWNER_LIST'));
    return true;
  }
  navigation.navigate('OwnerBuyListing', {
    q: device.displayName || device.modelName,
    categoryId: device.categoryId,
    categoryName: device.categoryName,
  });
  return true;
}
