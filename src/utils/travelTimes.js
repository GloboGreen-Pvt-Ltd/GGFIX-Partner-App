import { Car, Bike, Footprints } from 'lucide-react-native';

// Per-mode travel-time estimates from the customer's location to a shop, based
// on its distance, using average city speeds (km/h). "Bike" = cycle.
const CARD_MODES = [
  { key: 'car',  Icon: Car,        speed: 30 },
  { key: 'bike', Icon: Bike,       speed: 12 },
  { key: 'walk', Icon: Footprints, speed: 5 },
];

export function etaShort(km, speedKmh) {
  if (km == null || km <= 0) return '-';
  const mins = Math.max(1, Math.round((km / speedKmh) * 60));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Returns [{ key, Icon, text }] for ShopCard's `travelTimes` prop, or null.
export function travelTimesFor(km) {
  if (km == null || km <= 0) return null;
  return CARD_MODES.map((m) => ({ key: m.key, Icon: m.Icon, text: etaShort(km, m.speed) }));
}
