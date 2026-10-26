import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft, Camera, CircleCheck, ImageUp, RotateCcw, TriangleAlert, X, Zap, ZapOff,
} from 'lucide-react-native';
import { rf } from '../../../utils/responsive';
import { getLiveModules } from '../scanner/nativeModules';
import LiveScannerCamera, { LIVE_SCANNER_AVAILABLE } from '../scanner/LiveScannerCamera';
import FallbackScannerCamera from '../scanner/FallbackScannerCamera';
import {
  DETECT_OK, acceptedClasses, categoryLabel, checkDevicePhoto, discardTempImage, markValidated,
} from '../scanner/devicePhotoCheck';

/**
 * Device photo for a booking, validated against the booking's category
 * (params.category: MOBILE | TABLET | LAPTOP | SMARTWATCH | AUDIO_DEVICE).
 *
 *   camera  — live box: green = the right device, red = another device type.
 *             The shutter unlocks only on a confident right device.
 *   gallery — params.mode === 'gallery' opens the picker straight away.
 *   both    — the still is held TEMPORARILY, checked on-device, auto-cropped:
 *               ok            → Use photo
 *               anything else → rejected: Retake / Cancel only, temp files
 *                               deleted. Fail-closed — no manual override.
 *
 * Only an accepted photo leaves this screen: it is registered with
 * markValidated() and handed to params.onDone(asset) — the caller refuses
 * (and deletes) anything not registered. Nothing is uploaded here.
 */
const GREEN = '#035C6C';
const OK = '#3DDC97';
const INK = '#111111';
const MUTED = '#6B7280';
const MINT = '#E5F3F5';
const YELLOW = '#F3BF23';
const RED = '#D63232';

const LIVE = LIVE_SCANNER_AVAILABLE ? getLiveModules() : null;
const LIVE_DETECT = !!(LIVE?.frames && LIVE?.tflite && LIVE?.resizer);
// Categories the live box can gate the shutter on.
const GATED = new Set(['MOBILE', 'TABLET', 'LAPTOP']);

function useVisionPermission() {
  const p = LIVE.VC.useCameraPermission();
  const status = p.hasPermission ? 'granted' : p.canRequestPermission ? 'ask' : 'blocked';
  return { status, request: p.requestPermission };
}
function useExpoPermission() {
  const [permission, requestPermission] = useCameraPermissions();
  const status = !permission ? 'loading' : permission.granted ? 'granted' : permission.canAskAgain !== false ? 'ask' : 'blocked';
  return { status, request: requestPermission };
}
const useCamPermission = LIVE ? useVisionPermission : useExpoPermission;

function verdictFor(result, label) {
  switch (result.status) {
    case 'ok':
      return { title: `${label} verified`, note: 'Cropped around the device.' };
    case 'wrong_device':
      return { title: 'Wrong device detected', note: `Wrong device. Please capture a ${label}.` };
    case 'no_device':
      return { title: `No ${label} found`, note: `Please capture a ${label} — fit the whole device in the frame.` };
    case 'uncertain':
      return { title: `Can't confirm this is a ${label}`, note: `Please capture a ${label} — closer, in good light.` };
    case 'blurry':
      return { title: 'Photo is blurry', note: `Hold steady and capture the ${label} again.` };
    case 'unavailable':
      return { title: 'Device verification unavailable', note: 'This photo could not be verified, so it was not added.' };
    default:
      return { title: 'Photo not added', note: result.message || 'Try again.' };
  }
}

export default function DevicePhotoCaptureScreen({ navigation, route }) {
  const { onDone, mode, category } = route?.params || {};
  const gallery = mode === 'gallery';
  const label = categoryLabel(category);
  const accept = useMemo(() => acceptedClasses(category), [category]);
  const gated = GATED.has(category);

  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const [phase, setPhase] = useState(gallery ? 'checking' : 'live'); // live | checking | review | done
  const [result, setResult] = useState(null);
  const [torch, setTorch] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [detector, setDetector] = useState(LIVE_DETECT ? 'loading' : 'failed');
  const [live, setLive] = useState('none'); // none | right | wrong
  const hits = useRef(0);
  const misses = useRef(0);
  const camRef = useRef(null);
  const busy = useRef(false);
  const done = useRef(false);
  const checkId = useRef(0);
  const temps = useRef(new Set()); // every file this screen created / was handed

  // Drops every temp image except `keep` (the accepted photo, if any).
  const discardTemps = useCallback((keep) => {
    temps.current.forEach((u) => { if (u !== keep) discardTempImage(u); });
    temps.current = new Set(keep ? [keep] : []);
  }, []);
  // Leaving without accepting deletes everything and voids in-flight checks.
  useEffect(() => () => {
    checkId.current += 1;
    if (!done.current) discardTemps(null);
  }, [discardTemps]);

  // Two confident right-device frames unlock the shutter; two misses lock it.
  const onBox = useCallback((box) => {
    const right = !!box && box.score >= DETECT_OK && accept.includes(box.cls);
    const wrong = !!box && box.score >= DETECT_OK && !accept.includes(box.cls);
    if (right) {
      misses.current = 0;
      if (++hits.current >= 2) setLive('right');
    } else if (++misses.current >= 2) {
      hits.current = 0;
      setLive(wrong ? 'wrong' : 'none');
    }
  }, [accept]);

  const check = async (uri) => {
    const id = ++checkId.current;
    temps.current.add(uri);
    setPhase('checking');
    const r = await checkDevicePhoto(uri, category);
    if (id !== checkId.current) {
      // Retaken / left meanwhile: the result is void and its files go now.
      (r.temp || []).forEach(discardTempImage);
      return;
    }
    (r.temp || []).forEach((u) => temps.current.add(u));
    setResult(r);
    setPhase('review');
  };

  const pickFromGallery = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: false, quality: 0.9 });
      const asset = pick.canceled ? null : pick.assets?.[0];
      if (!asset?.uri) {
        if (gallery) navigation.goBack();
        return;
      }
      await check(asset.uri);
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (gallery) pickFromGallery();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const permission = useCamPermission();
  const granted = permission.status === 'granted';
  const asked = useRef(false);
  useEffect(() => {
    if (!gallery && isFocused && permission.status === 'ask' && !asked.current) {
      asked.current = true;
      Promise.resolve(permission.request()).catch(() => {});
    }
  }, [gallery, isFocused, permission]);

  // Live detection unavailable: the shutter stays open but the still is
  // checked anyway — and rejected if the check can't run either.
  const shutterOpen = !gated || detector === 'failed' ? true : detector === 'ready' && live === 'right';
  const capture = async () => {
    if (busy.current || !shutterOpen || !camRef.current || phase !== 'live') return;
    busy.current = true;
    try {
      const shot = await camRef.current.capture();
      await check(shot.uri);
    } catch (e) {
      setResult({ status: 'error', message: e?.message || 'Could not take the photo.' });
      setPhase('review');
    } finally {
      busy.current = false;
    }
  };

  const retake = () => {
    if (done.current || busy.current) return;
    checkId.current += 1;
    discardTemps(null);
    setResult(null);
    hits.current = 0;
    misses.current = 0;
    setLive('none');
    if (gallery) {
      setPhase('checking');
      pickFromGallery();
    } else {
      setPhase('live');
    }
  };

  // The only way out with a photo. Single-shot: `done` flips before anything
  // else, so repeated taps can't hand back twice or a stale result.
  const acceptPhoto = () => {
    if (done.current || phase !== 'review' || result?.status !== 'ok' || !result.uri) return;
    done.current = true;
    setPhase('done');
    markValidated(result.uri, { category, score: result.score });
    discardTemps(result.uri);
    const asset = {
      uri: result.uri,
      width: result.width,
      height: result.height,
      mimeType: 'image/jpeg',
      fileName: `device-${Date.now()}.jpg`,
    };
    navigation.goBack();
    if (typeof onDone === 'function') {
      try { onDone(asset); } catch (_) { /* caller handles its own errors */ }
    }
  };

  const showCamera = !gallery && granted && !cameraFailed;
  const cameraActive = showCamera && isFocused && appActive && phase === 'live';
  const CameraImpl = LIVE ? LiveScannerCamera : FallbackScannerCamera;
  const verdict = result ? verdictFor(result, label) : null;
  const statusText = !gated || detector === 'failed'
    ? `Fit the ${label} in the frame — it's verified after capture`
    : detector === 'loading'
      ? 'Starting device detection…'
      : live === 'right' ? `${label} detected — tap the shutter`
        : live === 'wrong' ? `Wrong device — capture a ${label}`
          : `Looking for a ${label}…`;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <View style={{ flex: 1 }}>
        {showCamera ? (
          <CameraImpl
            ref={camRef}
            isActive={cameraActive}
            torch={torch}
            hint={phase === 'live' ? `Point at the ${label} and fit it inside the frame` : null}
            detectOnly
            strongScore={DETECT_OK}
            acceptClasses={category && accept.length ? accept : null}
            wrongHint={`Wrong device — capture a ${label}`}
            onBox={onBox}
            onDetectorState={setDetector}
            onCameraError={() => setCameraFailed(true)}
          />
        ) : null}

        {(phase === 'review' || phase === 'done') && result?.uri ? (
          <Image source={{ uri: result.uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000' }} resizeMode="contain" />
        ) : null}

        {phase === 'checking' ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <ActivityIndicator color="#FFFFFF" size="large" />
            <Text style={{ marginTop: 10, color: '#FFFFFF', fontSize: rf(13), fontWeight: '700' }}>Checking photo…</Text>
          </View>
        ) : null}

        {/* Top bar */}
        <SafeAreaView edges={['top']} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6 }}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" className="active:opacity-70"
              style={{ height: 38, width: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
              <ArrowLeft size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: rf(16), fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }} numberOfLines={1}>{`${label} photo`}</Text>
            {showCamera && phase === 'live' && Platform.OS !== 'web' ? (
              <Pressable onPress={() => setTorch((t) => !t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={torch ? 'Torch off' : 'Torch on'} className="active:opacity-70"
                style={{ height: 38, width: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: torch ? YELLOW : 'rgba(0,0,0,0.35)' }}>
                {torch ? <Zap size={18} color={INK} /> : <ZapOff size={18} color="#FFFFFF" />}
              </Pressable>
            ) : <View style={{ width: 38 }} />}
          </View>
          {showCamera && phase === 'live' ? (
            <View style={{ alignSelf: 'center', maxWidth: '92%', marginTop: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: live === 'wrong' && gated ? 'rgba(214,50,50,0.85)' : 'rgba(0,0,0,0.55)' }}>
              {gated && live === 'right' ? <CircleCheck size={14} color={OK} style={{ marginRight: 6 }} /> : null}
              <Text style={{ flexShrink: 1, color: '#FFFFFF', fontSize: rf(12), fontWeight: '700' }}>{statusText}</Text>
            </View>
          ) : null}
        </SafeAreaView>

        {/* Permission / camera problems */}
        {!gallery && (!granted || cameraFailed) ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            {permission.status === 'loading' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={{ width: '100%', maxWidth: 360, borderRadius: 18, padding: 16, alignItems: 'center', backgroundColor: '#FFFFFF' }}>
                <View style={{ height: 52, width: 52, borderRadius: 26, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={24} color={GREEN} />
                </View>
                <Text style={{ marginTop: 10, fontSize: rf(15), fontWeight: '800', color: INK, textAlign: 'center' }}>
                  {cameraFailed ? "Camera couldn't start" : permission.status === 'blocked' ? 'Camera access is turned off' : 'Allow camera'}
                </Text>
                <Text style={{ marginTop: 4, fontSize: rf(12), color: MUTED, textAlign: 'center', lineHeight: rf(17) }}>
                  You can also pick the device photo from your gallery.
                </Text>
                <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 14, gap: 8 }}>
                  <SheetButton
                    primary
                    icon={Camera}
                    label={cameraFailed ? 'Try again' : permission.status === 'blocked' ? 'Open settings' : 'Allow camera'}
                    onPress={() => {
                      if (cameraFailed) setCameraFailed(false);
                      else if (permission.status === 'blocked') Linking.openSettings?.();
                      else Promise.resolve(permission.request()).catch(() => {});
                    }}
                  />
                  <SheetButton icon={ImageUp} label="Gallery" onPress={pickFromGallery} />
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {/* Bottom controls */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -20 }}>
        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          {phase === 'review' && verdict ? (
            <ResultCard
              ok={result.status === 'ok'}
              thumb={result.uri}
              title={verdict.title}
              selected={label}
              detected={result.status === 'ok' ? label : result.status === 'unavailable' ? 'Not checked' : (result.detected || 'Nothing recognisable')}
              note={verdict.note}
              onCancel={() => navigation.goBack()}
              onRetake={retake}
              retakeLabel={gallery ? 'Choose Another' : 'Retake Photo'}
              onUse={acceptPhoto}
            />
          ) : phase === 'live' && showCamera ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable onPress={pickFromGallery} accessibilityRole="button" accessibilityLabel="Pick from gallery" className="active:opacity-70"
                style={{ height: 48, width: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: MINT }}>
                <ImageUp size={20} color={GREEN} />
              </Pressable>
              <Pressable
                onPress={capture}
                disabled={!shutterOpen}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                accessibilityState={{ disabled: !shutterOpen }}
                style={{ height: 72, width: 72, borderRadius: 36, borderWidth: 4, borderColor: shutterOpen ? GREEN : '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{ height: 56, width: 56, borderRadius: 28, backgroundColor: shutterOpen ? GREEN : '#E5E7EB' }} />
              </Pressable>
              <View style={{ width: 48 }} />
            </View>
          ) : (
            <View style={{ height: 72 }} />
          )}
          {phase === 'live' && showCamera ? (
            <Text style={{ marginTop: 8, textAlign: 'center', fontSize: rf(11.5), color: MUTED }}>
              {shutterOpen ? `Only ${label} photos are accepted` : `The shutter unlocks when a ${label} is detected`}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Verdict card: thumbnail, badge, Selected / Detected, then actions. Rejected → Cancel / Retake only. */
function ResultCard({ ok, thumb, title, selected, detected, note, onCancel, onRetake, retakeLabel, onUse }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ height: 86, width: 86, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', backgroundColor: '#F3F4F6' }}>
          {thumb ? <Image source={{ uri: thumb }} style={{ height: '100%', width: '100%' }} resizeMode="cover" /> : null}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: ok ? MINT : '#FEECEC' }}>
            <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: ok ? GREEN : RED }}>{ok ? 'Verified' : 'Rejected'}</Text>
          </View>
          <Text style={{ marginTop: 4, fontSize: rf(14), fontWeight: '800', color: INK }} numberOfLines={2}>{title}</Text>
          <Text style={{ marginTop: 2, fontSize: rf(12), color: MUTED }} numberOfLines={1}>{`Selected: ${selected}`}</Text>
          <Text style={{ marginTop: 1, fontSize: rf(12), color: MUTED }} numberOfLines={1}>{`Detected: ${detected}`}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        {ok ? <CircleCheck size={15} color={GREEN} /> : <TriangleAlert size={15} color={RED} />}
        <Text style={{ flex: 1, marginLeft: 6, fontSize: rf(12.5), fontWeight: '700', color: INK }}>{note}</Text>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
        {ok ? (
          <>
            <SheetButton icon={RotateCcw} label={retakeLabel} onPress={onRetake} />
            <SheetButton primary icon={CircleCheck} label="Use photo" onPress={onUse} />
          </>
        ) : (
          <>
            <SheetButton icon={X} label="Cancel" onPress={onCancel} />
            <SheetButton primary icon={RotateCcw} label={retakeLabel} onPress={onRetake} />
          </>
        )}
      </View>
    </View>
  );
}

function SheetButton({ icon: Icon, label, onPress, primary }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="active:opacity-80"
      style={{
        flex: 1, minHeight: 46, paddingHorizontal: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? GREEN : '#FFFFFF', borderWidth: primary ? 0 : 1, borderColor: '#E5E7EB',
      }}
    >
      <Icon size={16} color={primary ? '#FFFFFF' : GREEN} />
      <Text style={{ flexShrink: 1, marginLeft: 6, fontSize: rf(13), fontWeight: '800', color: primary ? '#FFFFFF' : GREEN }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
