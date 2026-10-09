// Partner-app I/O for the shared product detector (./index.js, ./core.js):
// existing APIs only — master-data Google Vision identify, the optional
// visual-search service, and the cached device catalogue.
import { identifyDevice, visualSearch } from '../../api/masterData';
import { VISUAL_SEARCH_BASE } from '../../api/config';
import { loadSearchableModels } from '../../utils/deviceSearch';

const asset = (photo) => ({ uri: photo.uri, name: 'scan.jpg', type: photo.mimeType || 'image/jpeg' });

// Named function, not an async arrow inside a ternary: that shape breaks
// Metro's Hermes transform ("Property id of VariableDeclarator …").
async function visual(photo, { ocrText } = {}) {
  // Wide net (20): the detector then keeps the recognised brand / device type.
  const r = await visualSearch(asset(photo), { limit: 20, ocrText: ocrText || undefined });
  return { ok: true, confidence: r.confidence, matches: [r.bestMatch, ...(r.matches || [])].filter(Boolean), ocrText: r.ocrText || '' };
}

export default {
  async identify(photo) {
    const r = await identifyDevice(asset(photo), { limit: 8 });
    if (!r.configured || r.error) return { ok: false, error: r.error || 'not configured' };
    return {
      ok: true,
      confidence: r.confidence,
      label: r.recognisedAs || null,
      brand: r.brand || null,
      labels: r.labels || [],
      matches: [r.bestMatch, ...(r.matches || [])].filter(Boolean),
    };
  },
  visual: VISUAL_SEARCH_BASE ? visual : null,
  async catalog() {
    const rows = await loadSearchableModels();
    return rows.map((r) => ({
      id: r.modelId,
      brand: r.brandName,
      name: r.modelName,
      category: r.categoryName,
      modelNumbers: r.modelNumbers || [],
      ref: r,
    }));
  },
};
