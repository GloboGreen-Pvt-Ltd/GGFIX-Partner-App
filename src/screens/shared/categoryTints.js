// Per-category tile tint shared between OwnerSellHomeScreen and
// OwnerBuyListingScreen so both screens' category tiles read as the same
// colour for a given category, and neither file duplicates the palette.
const CODE_TINT = {
  MOBILE: '#E5F3F5',
  SMARTPHONE: '#E5F3F5',
  LAPTOP: '#F3ECFF',
  TABLET: '#EAF3FF',
  SMARTWATCH: '#E5F3F5',
  SMARTWATCHES: '#E5F3F5',
  AUDIO: '#FFF0F2',
  AUDIO_DEVICE: '#FFF0F2',
  AUDIO_DEVICES: '#FFF0F2',
};
const DEFAULT_TINT = '#F3F5F4';

export function tintFor(code) {
  return CODE_TINT[String(code || '').toUpperCase()] || DEFAULT_TINT;
}
