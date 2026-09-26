import AsyncStorage from '@react-native-async-storage/async-storage';

// One canonical key — nothing else in the app should read/write onboarding
// state under a different name (e.g. introSeen, firstLaunch, onboardingDone).
const ONBOARDING_COMPLETED_KEY = 'ggfix_partner_onboarding_completed';

// Whether the pre-login Intro screen has already been shown once. Fails open
// (treats storage errors as "seen") so a broken read can never trap a user on
// the intro screen instead of letting them reach Login.
export async function hasSeenIntro() {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)) === 'true';
  } catch {
    return true;
  }
}

export async function markIntroSeen() {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  } catch (_) {}
}

// DEV-ONLY test helper — lets Intro be shown again without reinstalling the
// app or clearing all app data. Never wired into any production code path;
// see IntroScreen's dev-only long-press on the wordmark. `__DEV__` is a
// React Native global that is always `false` in a release build, so this
// function is inert (and easy to tree-shake) outside of local development.
export async function resetOnboardingForTesting() {
  if (!__DEV__) return;
  try {
    await AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  } catch (_) {}
}
