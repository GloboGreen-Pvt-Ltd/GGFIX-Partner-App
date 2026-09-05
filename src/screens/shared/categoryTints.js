// Per-category tile tint shared between OwnerSellHomeScreen and
// OwnerBuyListingScreen so both screens' category tiles read as the same
// colour for a given category, and neither file duplicates the palette.
const CODE_TINT = {
  MOBILE: '#E6F7E3',
  SMARTPHONE: '#E6F7E3',
  LAPTOP: '#F3ECFF',
  TABLET: '#EAF3FF',
  SMARTWATCH: '#EAF7F2',
  SMARTWATCHES: '#EAF7F2',
  AUDIO: '#FFF0F2',
  AUDIO_DEVICE: '#FFF0F2',
  AUDIO_DEVICES: '#FFF0F2',
};
const DEFAULT_TINT = '#F3F5F4';

export function tintFor(code) {
  return CODE_TINT[String(code || '').toUpperCase()] || DEFAULT_TINT;
}
