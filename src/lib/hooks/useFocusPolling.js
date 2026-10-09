import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

// Re-run `poll` every `ms` while the screen is focused, so booking status
// changes made from the other app (customer <-> shop) appear without leaving
// the screen. Ticks are skipped while the app is backgrounded; `poll` should
// be a silent refresh (no loader) and be memoised by the caller.
export function useFocusPolling(poll, ms = 15000) {
  useFocusEffect(useCallback(() => {
    const id = setInterval(() => {
      if (AppState.currentState === 'active') poll();
    }, ms);
    return () => clearInterval(id);
  }, [poll, ms]));
}

export default useFocusPolling;
