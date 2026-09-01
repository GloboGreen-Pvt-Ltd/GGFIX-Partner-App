import { masterApi } from './client';

/**
 * IMEI → device lookup. Calls the server-side proxy in master-data-service
 * (GET /master/imei-lookup) which talks to IMEI.info with a token that never
 * leaves the backend, then resolves the result to a ggfix catalog device by
 * matching master_models.model_number (falling back to brand + model name).
 *
 * Always resolves (never throws) so the booking flow can degrade to manual
 * device selection. Shape:
 *   {
 *     imei, configured, matched,
 *     raw?:    { brand, model, modelNumbers: [] },
 *     device?: { categoryId, categoryCode, categoryName, brandId, brandName,
 *                modelId, modelName, modelNumber, imageUrl, imageBase64 },
 *     error?:  'INVALID_IMEI' | 'NOT_CONFIGURED' | 'PROVIDER_UNREACHABLE' | ...
 *   }
 */
export async function lookupImei(imei) {
  const digits = String(imei || '').replace(/[^0-9]/g, '');
  if (digits.length < 14 || digits.length > 17) {
    return { imei: digits, configured: false, matched: false, error: 'INVALID_IMEI' };
  }
  try {
    return await masterApi.get('/master/imei-lookup', { query: { imei: digits } });
  } catch (e) {
    return { imei: digits, configured: false, matched: false, error: 'REQUEST_FAILED' };
  }
}
