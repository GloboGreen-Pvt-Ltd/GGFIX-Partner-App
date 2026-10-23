import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Linking, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft, Zap, ZapOff, ImageUp, Keyboard as KeyboardIcon, Camera, BadgeCheck, X,
} from 'lucide-react-native';
import { rf } from '../../utils/responsive';
import { navigateDeviceAction } from '../../utils/deviceActions';
import { warmProductDetect } from '../../lib/productDetect';
import { extractIdentifiersFromOCR, resolveExactTicket } from '../../utils/scanSearch';
import { getLiveModules } from './scanner/nativeModules';
import LiveScannerCamera, { LIVE_SCANNER_AVAILABLE } from './scanner/LiveScannerCamera';
import FallbackScannerCamera from './scanner/FallbackScannerCamera';
import ScanResultsSheet from './scanner/ScanResultsSheet';
import { identifyScan, looksLikeBookingId, reportPick } from './scanner/identifyPipeline';

/**
 * "Search product by camera" — Google-Lens-style: live camera with
 * continuous auto-focus, tap-to-focus, pinch / chip zoom and torch; on-device
 * device detection (EfficientDet box → crop), live ML Kit OCR + QR/barcode;
 * capture or gallery → POST /master/device-identify → the top catalogue
 * matches with photos and a match %. The user ALWAYS taps the model; nothing
 * is auto-selected from a confidence number. Picking a match opens the same
 * Repair / Sell / Buy flows as before (utils/deviceActions.js); the pick is
 * reported back to the server (feedback) so confidence can be calibrated.
 *
 * Builds without VisionCamera 5 (older dev clients, web) use the old
 * expo-camera capture with a centre-reticle crop — same results sheet.
 */
const GREEN = '#035C6C';
const INK = '#111111';
const YELLOW = '#F3BF23';
const GREEN_TEXT = '#035C6C';
const MINT = '#E5F3F5';
const MUTED = '#6B7280';
const HINT = 'Point at the device (the back with the cameras works best) and tap the shutter';

const LIVE = LIVE_SCANNER_AVAILABLE ? getLiveModules() : null;

/** One permission shape for both camera stacks: { status: 'loading'|'granted'|'ask'|'blocked', request }. */
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
const useScannerPermission = LIVE ? useVisionPermission : useExpoPermission;

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function SheetButton({ icon: Icon, label, onPress, primary }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:opacity-85"
      style={{
        flex: 1, height: 42, borderRadius: 12, marginHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? GREEN : '#FFFFFF', borderWidth: primary ? 0 : 1.5, borderColor: GREEN,
      }}
    >
      {Icon ? <Icon size={15} color={primary ? '#FFFFFF' : GREEN_TEXT} /> : null}
      <Text style={{ marginLeft: Icon ? 6 : 0, fontSize: rf(12.5), fontWeight: '800', color: primary ? '#FFFFFF' : GREEN_TEXT }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function ProductScanScreen({ navigation }) {
  const { height: screenH } = useWindowDimensions();
  const permission = useScannerPermission();
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const [torch, setTorch] = useState(false);
  const [phase, setPhase] = useState('live'); // 'live' | 'capturing' | 'identifying' | 'results'
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [liveHit, setLiveHit] = useState(null); // booking read live from a QR / barcode / IMEI / tracking ID
  const [cameraFailed, setCameraFailed] = useState(false);
  const camRef = useRef(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const asked = useRef(false);
  const checked = useRef(new Set());
  const reported = useRef(null);
  useEffect(() => () => { mounted.current = false; }, []);

  const granted = permission.status === 'granted';
  // Camera runs only while this screen is visible, the app is foregrounded and
  // nothing is frozen on screen — released on blur / background / results.
  const cameraActive = granted && isFocused && appActive && !cameraFailed && (phase === 'live' || phase === 'capturing');

  // Ask once when first shown; a denied/blocked permission shows Settings instead.
  useEffect(() => {
    if (isFocused && permission.status === 'ask' && !asked.current) {
      asked.current = true;
      Promise.resolve(permission.request()).catch(() => {});
    }
  }, [isFocused, permission]);

  // Build the catalogue index before the first photo.
  useEffect(() => { warmProductDetect(); }, []);
  // Leaving the screen turns the torch off.
  useEffect(() => { if (!isFocused || !appActive) setTorch(false); }, [isFocused, appActive]);

  const reset = () => {
    busyRef.current = false;
    reported.current = null;
    setResult(null);
    setSelected(null);
    setSnapshot(null);
    setPhase('live');
  };
  const typeInstead = (prefillQuery) => {
    const params = {};
    if (prefillQuery) params.prefillQuery = prefillQuery;
    // Lets OwnerSearch report a manual pick for this scan (rank -1).
    if (result?.scanId) params.scanId = result.scanId;
    navigation.replace('OwnerSearch', Object.keys(params).length ? params : undefined);
  };
  const openTicket = (ticket) => navigation.replace('DeviceDetail', { ticketId: ticket.id });

  const onAction = (key, item) => {
    if (!navigateDeviceAction(navigation, key, item.row)) {
      Alert.alert('Device unavailable', 'That model is missing its catalogue id, so the flow cannot be started from here.', [{ text: 'OK' }]);
      return;
    }
    const tag = `${result?.scanId}:${item.row.modelId}`;
    if (reported.current !== tag) {
      reported.current = tag;
      reportPick(result?.scanId, item);
    }
  };

  // Live reads that name ONE booking (QR / barcode / IMEI / tracking ID) keep
  // the existing exact-ticket lookup; the hit is offered, never auto-opened.
  const tryBooking = useCallback((raw) => {
    const v = looksLikeBookingId(raw);
    if (!v || checked.current.has(v) || checked.current.size > 40) return;
    checked.current.add(v);
    resolveExactTicket(v).then((t) => { if (t && mounted.current) setLiveHit({ ticket: t, value: v }); }).catch(() => {});
  }, []);
  const onLiveCodes = useCallback((values) => values.forEach(tryBooking), [tryBooking]);
  const onLiveText = useCallback((text) => {
    const ids = extractIdentifiersFromOCR(text);
    [...ids.trackingIds, ...ids.imeis].slice(0, 3).forEach(tryBooking);
  }, [tryBooking]);

  const identify = async (shot) => {
    setPhase('identifying');
    setResult(null);
    setSelected(null);
    try {
      const r = await identifyScan(shot);
      if (!mounted.current) return;
      setResult({ kind: 'matches', ...r });
    } catch (e) {
      if (!mounted.current) return;
      setResult({ kind: 'error', message: "Can't reach the product recognition service. Check your connection and try again, or type the name." });
    } finally {
      busyRef.current = false;
      if (mounted.current) setPhase('results');
    }
  };

  const capture = async () => {
    if (busyRef.current || !camRef.current || !cameraActive) return;
    busyRef.current = true;
    setPhase('capturing');
    let shot;
    try {
      shot = await camRef.current.capture();
    } catch (e) {
      busyRef.current = false;
      if (!mounted.current) return;
      setResult({ kind: 'error', message: "Couldn't take the photo. Please try again." });
      setPhase('results');
      return;
    }
    if (!mounted.current) return;
    setSnapshot(shot.uri);
    await identify({ ...shot, source: 'CAMERA' });
  };

  const fromGallery = async () => {
    if (busyRef.current) return;
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
      const asset = pick.canceled ? null : pick.assets?.[0];
      if (!asset?.uri || busyRef.current) return;
      busyRef.current = true;
      setSnapshot(asset.uri);
      await identify({ uri: asset.uri, crop: null, cropSource: 'full', detected: null, liveText: '', liveCodes: [], source: 'GALLERY' });
    } catch (_) {
      busyRef.current = false;
    }
  };

  // The camera stays mounted (just inactive) under the frozen photo, so
  // "Take another photo" resumes instantly instead of rebuilding the session.
  const showCamera = granted && !cameraFailed;
  const frozen = !!snapshot && phase !== 'live' && phase !== 'capturing';
  const CameraImpl = LIVE ? LiveScannerCamera : FallbackScannerCamera;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {/* Camera / frozen photo */}
      <View style={{ flex: 1 }}>
        {showCamera ? (
          <CameraImpl
            ref={camRef}
            isActive={cameraActive}
            torch={torch}
            hint={phase === 'live' ? HINT : null}
            onText={onLiveText}
            onCodes={onLiveCodes}
            onCameraError={() => setCameraFailed(true)}
          />
        ) : null}
        {frozen ? (
          <Image source={{ uri: snapshot }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000' }} resizeMode="cover" />
        ) : null}

        {/* Top bar */}
        <SafeAreaView edges={['top']} pointerEvents="box-none">
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6 }}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" className="active:opacity-70"
              style={{ height: 38, width: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
              <ArrowLeft size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: rf(16), fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>Search product by camera</Text>
            {showCamera && !frozen && Platform.OS !== 'web' ? (
              <Pressable onPress={() => setTorch((t) => !t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={torch ? 'Torch off' : 'Torch on'} className="active:opacity-70"
                style={{ height: 38, width: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: torch ? YELLOW : 'rgba(0,0,0,0.35)' }}>
                {torch ? <Zap size={18} color={INK} /> : <ZapOff size={18} color="#FFFFFF" />}
              </Pressable>
            ) : <View style={{ width: 38 }} />}
          </View>

          {liveHit && phase === 'live' ? (
            <View style={{ marginHorizontal: 12, marginTop: 10, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', padding: 10 }}>
              <BadgeCheck size={18} color={GREEN} />
              <Pressable onPress={() => openTicket(liveHit.ticket)} accessibilityRole="button" style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: INK }} numberOfLines={1}>Booking found · #{liveHit.ticket.trackingId || liveHit.ticket.id}</Text>
                <Text style={{ fontSize: rf(10.5), color: MUTED }} numberOfLines={1}>{liveHit.ticket.deviceDisplayName || liveHit.ticket.deviceModelName || 'Tap to open the booking'}</Text>
              </Pressable>
              <Pressable onPress={() => openTicket(liveHit.ticket)} accessibilityRole="button" style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: GREEN }}>
                <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: '#FFFFFF' }}>Open</Text>
              </Pressable>
              <Pressable onPress={() => setLiveHit(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss" style={{ marginLeft: 8 }}>
                <X size={16} color={MUTED} />
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>

        {/* Permission / camera problems */}
        {!granted || cameraFailed ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            {permission.status === 'loading' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={{ width: '100%', maxWidth: 360, borderRadius: 18, padding: 16, alignItems: 'center', backgroundColor: '#FFFFFF' }}>
                <View style={{ height: 52, width: 52, borderRadius: 26, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={24} color={GREEN_TEXT} />
                </View>
                <Text style={{ marginTop: 10, fontSize: rf(15), fontWeight: '800', color: INK, textAlign: 'center' }}>
                  {cameraFailed ? "Camera couldn't start" : permission.status === 'blocked' ? 'Camera access is turned off' : 'Allow camera to search'}
                </Text>
                <Text style={{ marginTop: 4, fontSize: rf(12), color: MUTED, textAlign: 'center', lineHeight: rf(17) }}>
                  {cameraFailed
                    ? 'Another app may be using it. Try again, or pick a photo from your gallery.'
                    : permission.status === 'blocked'
                      ? 'Turn on Camera for Near G Fix Partner in Settings → Permissions. You can also pick a photo from your gallery.'
                      : 'Near G Fix uses the camera only to identify the device. You can also pick a photo from your gallery.'}
                </Text>
                <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 14, marginHorizontal: -4 }}>
                  {cameraFailed ? (
                    <SheetButton primary icon={Camera} label="Try again" onPress={() => setCameraFailed(false)} />
                  ) : permission.status === 'blocked' ? (
                    <SheetButton primary icon={Camera} label="Open settings" onPress={() => Linking.openSettings?.()} />
                  ) : (
                    <SheetButton primary icon={Camera} label="Allow camera" onPress={() => Promise.resolve(permission.request()).catch(() => {})} />
                  )}
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {/* Bottom sheet — overlaps the camera by its corner radius */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -20 }}>
        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}>
          {phase === 'identifying' || phase === 'results' ? (
            <ScanResultsSheet
              state={phase}
              result={result}
              selected={selected}
              onSelect={setSelected}
              onAction={onAction}
              onSearch={typeInstead}
              onRetake={reset}
              onOpenTicket={openTicket}
              maxHeight={Math.round(screenH * 0.62)}
            />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
              <Pressable onPress={fromGallery} accessibilityRole="button" accessibilityLabel="Pick a photo" className="active:opacity-70" style={{ alignItems: 'center', width: 80 }}>
                <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}><ImageUp size={20} color={GREEN_TEXT} /></View>
                <Text style={{ marginTop: 4, fontSize: rf(11), fontWeight: '700', color: INK }}>Gallery</Text>
              </Pressable>
              <Pressable
                onPress={capture}
                disabled={!cameraActive || phase !== 'live'}
                accessibilityRole="button"
                accessibilityLabel="Take photo to identify product"
                className="active:opacity-80"
                style={{ height: 70, width: 70, borderRadius: 35, borderWidth: 4, borderColor: GREEN, alignItems: 'center', justifyContent: 'center', opacity: cameraActive ? 1 : 0.4 }}
              >
                <View style={{ height: 54, width: 54, borderRadius: 27, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
                  {phase === 'capturing' ? <ActivityIndicator color="#FFFFFF" /> : <Camera size={24} color="#FFFFFF" />}
                </View>
              </Pressable>
              <Pressable onPress={() => typeInstead()} accessibilityRole="button" accessibilityLabel="Type instead" className="active:opacity-70" style={{ alignItems: 'center', width: 80 }}>
                <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}><KeyboardIcon size={20} color={GREEN_TEXT} /></View>
                <Text style={{ marginTop: 4, fontSize: rf(11), fontWeight: '700', color: INK }}>Type</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
