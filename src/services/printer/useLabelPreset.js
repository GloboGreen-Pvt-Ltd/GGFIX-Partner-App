import { useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_LABEL_PRESET, getLabelPreset } from './labelPresets';
import { getLabelPresetId, saveLabelPresetId } from './storage';

// Selected Page Setup preset, remembered for the app session (module state,
// shared by the QR E-Print screen and its Print QR Label sheet) and saved
// best-effort to AsyncStorage so the shop's label stock survives a restart.
let currentId = DEFAULT_LABEL_PRESET.id;
let hydrated = false;
let pickedThisSession = false;
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => currentId;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  getLabelPresetId()
    .then((id) => {
      // A pick made before storage answered wins over the stored value.
      if (pickedThisSession || !id || getLabelPreset(id).id !== id || id === currentId) return;
      currentId = id;
      listeners.forEach((l) => l());
    })
    .catch(() => {});
}

export function setLabelPresetId(id) {
  const next = getLabelPreset(id).id;
  pickedThisSession = true;
  if (next === currentId) return;
  currentId = next;
  listeners.forEach((l) => l());
  saveLabelPresetId(next).catch(() => {});
}

/** [preset, setPresetId] — the current LABEL_PRESETS entry and its setter. */
export function useLabelPreset() {
  useEffect(() => { hydrate(); }, []);
  const id = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return [getLabelPreset(id), setLabelPresetId];
}
