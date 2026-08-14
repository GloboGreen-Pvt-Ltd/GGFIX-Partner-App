import { getBrands, getModelsByBrand, getRamOptions, getStorageOptions } from '../api/masterData';

// Resolve a repair booking's device name / image / specs from its stored IDs
// (the booking record only keeps brandId/modelId/ramOptionId/storageOptionId).
export async function resolveBookingDevice(b) {
  if (!b) return {};
  const [brands, models, rams, storages] = await Promise.all([
    getBrands().catch(() => []),
    b.brandId ? getModelsByBrand(b.brandId).catch(() => []) : [],
    getRamOptions().catch(() => []),
    getStorageOptions().catch(() => []),
  ]);
  const model = (models || []).find((m) => m.id === b.modelId);
  const brandName = (brands || []).find((x) => x.id === b.brandId)?.name;
  const ramLabel = (rams || []).find((r) => r.id === b.ramOptionId)?.label;
  const storageLabel = (storages || []).find((s) => s.id === b.storageOptionId)?.label;
  const image = model?.imageUrl || (model?.imageBase64 ? `data:image/png;base64,${model.imageBase64}` : null);
  const storageText = [ramLabel, storageLabel].filter(Boolean).join(' / ');
  return {
    name: b.modelName || model?.name || (brandName ? `${brandName} device` : 'Device'),
    image,
    brandName,
    ramLabel,
    storageLabel,
    storageText,
    specs: [brandName, b.color, storageText].filter(Boolean).join(' · '),
  };
}
