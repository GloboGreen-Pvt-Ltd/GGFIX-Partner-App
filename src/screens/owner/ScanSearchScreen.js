import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  ChevronLeft,
  ScanLine,
  ScanSearch,
  Zap,
  ZapOff,
  ImagePlus,
  RotateCcw,
  AlertTriangle,
  Camera as CameraIcon,
  Search as SearchIcon,
  BadgeCheck,
  Truck,
  Smartphone,
  ChevronRight,
} from 'lucide-react-native';
import { notify } from '../../components/confirm';
import {
  normalizeScannedIdentifier,
  resolveExactTicket,
  searchGlobalRecords,
  extractIdentifiersFromOCR,
  searchByIdentifiers,
  runVisualSearch,
  runDeviceIdentify,
  runTextRecognition,
  catalogueMatchesFromText,
} from '../../utils/scanSearch';
import { rf, rs } from '../../utils/responsive';

// @react-native-ml-kit/text-recognition is a NATIVE module (wraps Google ML
// Kit on Android, Apple's Vision framework on iOS) — it is NOT available in
// Expo Go, only in a custom development build (`npx expo run:android` /
// `eas build --profile development`). Calling it inside Expo Go throws
// immediately (native module not linked); that's caught below and surfaced
// as a clear message rather than crashing or silently pretending OCR ran.

// GGFIX palette — same values used across the rest of the app's redesigned screens.
// Brand palette (same swatches as the Customer app's scanner).
const ACCENT = '#1E1E1E';
const BRIGHT = '#09AD2A';
const MINT = 'rgba(9,173,42,0.10)';

// Barcode types both modes can decode — QR plus the common retail/product
// barcode families (matches what ScanQrCodeScreen / ScanImeiScreen already
// use elsewhere in this app, just unioned into one list).
const BARCODE_TYPES = ['qr', 'datamatrix', 'code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'codabar', 'itf14'];

/**
 * One camera screen behind both new search-bar buttons, switched by
 * `route.params.mode`:
 *
 *   'qr'   — "Scan QR or Barcode": tracking slips, IMEI stickers, product
 *            barcodes. Barcode/QR detection only.
 *   'lens' — "Visual Device Scanner": live barcode/QR detection (same as
 *            'qr'), PLUS capture/gallery →
 *              1. on-device OCR (@react-native-ml-kit/text-recognition) →
 *                 identifier extraction (tracking ID / IMEI / model code /
 *                 brand+model text)
 *              2. real image-to-image visual search against the GGFIX
 *                 device catalogue's own product photos
 *                 (utils/scanSearch.js's `runVisualSearch`, a genuine CLIP-
 *                 embedding similarity search run by the standalone
 *                 ggfix-visual-search-service — see that function's comment
 *                 and the service's README.md), given the OCR text as a
 *                 multi-signal exact-match/boost input
 *            Priority: an exact tracking ID/IMEI read by OCR wins outright
 *            (it names one specific booking); otherwise a high-confidence
 *            visual match ("Device Found") wins; otherwise medium-confidence
 *            visual matches show as a ranked "Possible matches" list;
 *            otherwise the OCR text itself is searched as free text, same as
 *            before visual search existed. Manual typing is only a fallback
 *            button, shown when none of the above found anything.
 *            NOTE: the OCR library is a native module and does not run
 *            inside Expo Go — see `runTextRecognition` below for exactly
 *            what happens (and is reported to the owner) in that case.
 *
 * Both modes funnel every result through utils/scanSearch.js, the same
 * ticket/device/pickup sources OwnerSearchScreen's text search already uses.
 */
export default function ScanSearchScreen({ navigation, route }) {
  const mode = route?.params?.mode === 'lens' ? 'lens' : 'qr';
  const isLens = mode === 'lens';

  // TEMP DEBUG — remove once the scan flow is verified on a real device.
  useEffect(() => { console.log(`[QR] screen mounted, mode=${mode}`); }, [mode]);

  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('Searching GGFIX…');
  const [result, setResult] = useState(null); // { kind: 'ticket'|'pickup'|'device'|'device-found'|'multi'|'visual-matches'|'visual-unavailable'|'none'|'ocr-failed'|'error', ... }
  const [ocrPhotoUri, setOcrPhotoUri] = useState(null); // last lens capture/pick — kept for Retake + result thumbnail
  const [showManualEntry, setShowManualEntry] = useState(false); // fallback-only, see runLensOCR
  const [manualText, setManualText] = useState('');
  const capturingRef = useRef(false); // one lens capture at a time
  const cameraRef = useRef(null);
  const handlingRef = useRef(false); // scan-lock — see PREVENT DUPLICATE SCANS below

  useEffect(() => {
    // TEMP DEBUG — never logs the payload, just the coarse state.
    console.log('[QR] permission status:', permission ? (permission.granted ? 'granted' : permission.canAskAgain ? 'not-granted (asking)' : 'denied-permanently') : 'loading');
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const reset = () => {
    handlingRef.current = false;
    setScanned(false);
    setLoading(false);
    setLoadingStage('Searching GGFIX…');
    setResult(null);
    setOcrPhotoUri(null);
    setShowManualEntry(false);
    setManualText('');
  };

  // ── core: scanned/typed value → real database search → navigate ─────────
  const runSearch = async (rawValue) => {
    const identifier = normalizeScannedIdentifier(rawValue);
    // TEMP DEBUG — length/shape only, never the raw payload (could be a
    // customer's data in a non-GGFIX QR).
    console.log(`[QR] normalized type=${typeof identifier}, length=${identifier ? String(identifier).length : 0}`);
    if (!identifier) {
      setResult({ kind: 'none', raw: rawValue });
      setLoading(false);
      return;
    }
    console.log('[QR] lookup started');
    try {
      // Exact path first — a QR/barcode almost always encodes one precise
      // identifier (tracking ID / ticket id / IMEI), so try to resolve it as
      // a single ticket before falling back to fuzzy multi-source search.
      const ticket = await resolveExactTicket(identifier);
      if (ticket) {
        console.log('[QR] lookup success: exact ticket match');
        setResult({ kind: 'ticket', ticket });
        setLoading(false);
        return;
      }

      const { devices, tickets, pickups } = await searchGlobalRecords(identifier);
      const totalMatches = devices.length + tickets.length + pickups.length;
      console.log(`[QR] lookup success: devices=${devices.length} tickets=${tickets.length} pickups=${pickups.length}`);

      if (totalMatches === 0) {
        setResult({ kind: 'none', raw: identifier });
      } else if (tickets.length === 1 && devices.length === 0 && pickups.length === 0) {
        setResult({ kind: 'ticket', ticket: tickets[0] });
      } else if (pickups.length === 1 && devices.length === 0 && tickets.length === 0) {
        setResult({ kind: 'pickup', pickup: pickups[0] });
      } else if (devices.length === 1 && tickets.length === 0 && pickups.length === 0) {
        setResult({ kind: 'device', device: devices[0] });
      } else {
        // Multiple matches across one or more sources — hand off to the
        // existing search screen's own result list rather than building a
        // second one here.
        setResult({ kind: 'multi', query: identifier, count: totalMatches });
      }
    } catch (e) {
      console.log('[QR] lookup failure:', e?.message || String(e));
      setResult({ kind: 'error', message: e?.message || 'Search failed. Check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleBarcode = ({ data, type }) => {
    if (handlingRef.current || scanned) return;
    console.log(`[QR] code detected, type=${type || 'unknown'}`);
    handlingRef.current = true;
    setScanned(true);
    setLoading(true);
    runSearch(data);
  };

  const openTicket = (ticket) => { console.log('[QR] navigation executed -> DeviceDetail'); navigation.replace('DeviceDetail', { ticketId: ticket.id }); };
  const openPickup = (pickup) => { console.log('[QR] navigation executed -> OwnerPickupServiceDetail'); navigation.navigate('OwnerPickupServiceDetail', { id: pickup.id, booking: pickup }); };
  const searchManually = (prefillQuery) => navigation.replace('OwnerSearch', prefillQuery ? { prefillQuery } : undefined);
  // A visual match names a catalogue device, not one specific booking, so it
  // opens the same real device flow (OwnerSearch → book/sell/buy) a text or
  // QR device match already uses — no duplicate device-detail screen.
  const openVisualMatch = (m) => { console.log('[LENS] navigation executed -> OwnerSearch (visual match)'); searchManually(m.displayName); };
  // "View Similar Matches" on a high-confidence "Device Found" card drops
  // into the same ranked list a medium-confidence result already shows —
  // both draw from the one `matches` array the visual-search service
  // returned alongside its `bestMatch`, nothing re-fetched or invented.
  const viewSimilarMatches = (matches) => setResult({ kind: 'visual-matches', matches });
  // A model picked from the photo-text list opens the same device card a
  // text/QR device match shows (Book, sell or buy this device).
  const pickCatalogueDevice = (row) => setResult({ kind: 'device', device: row });

  // ── Lens: capture/gallery → OCR → real visual search → result ────────────
  // PHOTO → on-device OCR (local) → ggfix-visual-search-service (real CLIP
  // embedding search over the actual GGFIX catalogue, given the OCR text as
  // a multi-signal boost/exact-match input) → RESULT, by priority: exact OCR
  // tracking ID/IMEI (one specific booking) > high-confidence visual match
  // ("Device Found") > medium-confidence visual matches ("Possible
  // matches") > OCR free-text database search > nothing. Manual typing
  // (below) only appears if this whole chain comes up empty.
  const runLensCapture = async (uri) => {
    setOcrPhotoUri(uri);
    setShowManualEntry(false);
    setScanned(true);
    setLoading(true);
    setLoadingStage('Analyzing device…');
    console.log('[LENS] capture started');

    // Run on-device OCR first (fast, local) so its raw text can be handed to
    // the visual-search service as a multi-signal boost/exact-match input on
    // the SAME request, rather than two round trips.
    const ocr = await runTextRecognition(uri);
    console.log(`[LENS] OCR ${ocr.ok ? `ok (len=${ocr.text.length})` : `failed: ${ocr.message}`}`);
    const candidates = ocr.ok ? extractIdentifiersFromOCR(ocr.text) : null;
    const candidateCount = candidates ? Object.values(candidates).reduce((n, arr) => n + arr.length, 0) : 0;

    // 1. An exact tracking ID / IMEI read off the photo beats everything —
    //    it names one specific booking, not just a device model.
    if (candidateCount) {
      for (const value of [...candidates.trackingIds, ...candidates.imeis]) {
        const ticket = await resolveExactTicket(value).catch(() => null);
        if (ticket) {
          console.log('[LENS] exact match via OCR identifier');
          setLoading(false);
          setResult({ kind: 'ticket', ticket });
          return;
        }
      }
    }

    // 2. Google Cloud Vision (server-side, like Google Lens): what the web
    //    says this photo shows — "samsung galaxy s8+" — ranked against the
    //    GGFIX catalogue. Close siblings (S8 ↔ S8+) are always in the list,
    //    because one photo of a phone's back often can't tell them apart.
    setLoadingStage('Identifying device…');
    const google = await runDeviceIdentify(uri);
    console.log(`[LENS] google vision ${google.ok ? `ok, confidence=${google.confidence}, matches=${google.matches.length}, label=${google.labels?.[0] || '-'}` : `unavailable: ${google.error || (google.configured ? 'error' : 'not configured')}`}`);
    const googleLabel = google.recognisedAs || google.labels?.[0] || null;
    if (google.ok && google.bestMatch && google.confidence === 'high') {
      setLoading(false);
      setResult({ kind: 'device-found', best: google.bestMatch, matches: google.matches, label: googleLabel });
      return;
    }
    if (google.ok && google.bestMatch && google.matches.length) {
      setLoading(false);
      setResult({ kind: 'visual-matches', matches: google.matches, label: googleLabel });
      return;
    }
    if (google.ok && google.brand) {
      // Google saw only the brand: that brand's models, ranked by any model
      // words the on-device text reader picked up.
      const fromBrand = await catalogueMatchesFromText([google.brand, ocr.ok ? ocr.text : ''].join('\n')).catch(() => null);
      if (fromBrand?.exact) {
        setLoading(false);
        setResult({ kind: 'device', device: fromBrand.exact });
        return;
      }
      if (fromBrand?.rows?.length) {
        setLoading(false);
        setResult({ kind: 'text-matches', ...fromBrand, source: 'google', readText: googleLabel || google.brand });
        return;
      }
    }

    setLoadingStage('Searching GGFIX image library…');
    console.log('[LENS] visual search started');
    const visual = await runVisualSearch(uri, { ocrText: ocr.ok ? ocr.text : null });
    console.log(`[LENS] visual search ${visual.ok ? `ok, confidence=${visual.confidence}, candidates=${visual.matches.length}` : `unavailable: ${visual.message}`}`);

    // 2b. Self-hosted image library (ggfix-visual-search-service), when this
    //    build points at one. High confidence — one specific catalogue
    //    device, shown as "Device Found". Medium — a ranked "Possible matches" list. Both come
    //    straight from the service's own embedding search; nothing here
    //    reorders or invents a candidate.
    if (visual.ok && visual.confidence === 'high' && visual.bestMatch) {
      console.log(`[LENS] device found: ${visual.bestMatch.brand} ${visual.bestMatch.modelName}`);
      setLoading(false);
      setResult({ kind: 'device-found', best: visual.bestMatch, matches: visual.matches });
      return;
    }
    if (visual.ok && visual.confidence === 'medium' && visual.matches.length) {
      console.log(`[LENS] possible matches: top=${visual.matches[0]?.displayName}`);
      setLoading(false);
      setResult({ kind: 'visual-matches', matches: visual.matches });
      return;
    }

    // 3. Image matching couldn't answer (not configured for this build,
    //    unreachable, or not confident) — match what the photo SAYS against
    //    the catalogue: a printed model number (e.g. SM-G950FD on a Galaxy
    //    S8's back) names the exact model; a brand name ("SAMSUNG") lists
    //    that brand's models to pick from.
    const readText = ocr.ok ? String(ocr.text || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    if (readText) {
      setLoadingStage('Matching the GGFIX catalogue…');
      const fromText = await catalogueMatchesFromText(ocr.text).catch(() => null);
      console.log(`[LENS] catalogue text match: ${fromText?.matchedOn || 'none'}, rows=${fromText?.rows?.length || 0}`);
      if (fromText?.exact) {
        setLoading(false);
        setResult({ kind: 'device', device: fromText.exact });
        return;
      }
      if (fromText?.rows?.length) {
        setLoading(false);
        setResult({ kind: 'text-matches', ...fromText, readText });
        return;
      }
    }

    // 4. Nothing in the catalogue — search whatever OCR read across bookings
    //    and pickups, same as before visual search existed.
    if (candidateCount) {
      console.log('[LENS] lookup started (OCR free-text fallback)');
      try {
        const outcome = await searchByIdentifiers(candidates);
        console.log(`[LENS] lookup outcome: ${outcome.kind}`);
        setLoading(false);
        if (outcome.kind === 'ticket') setResult({ kind: 'ticket', ticket: outcome.ticket });
        else if (outcome.kind === 'pickup') setResult({ kind: 'pickup', pickup: outcome.pickup });
        else if (outcome.kind === 'device') setResult({ kind: 'device', device: outcome.device });
        else if (outcome.kind === 'multi') setResult({ kind: 'multi', query: outcome.query, count: outcome.count });
        else if (!visual.ok) setResult({ kind: 'visual-unavailable', message: visual.message, notConfigured: visual.notConfigured, readText, detected: candidates });
        else setResult({ kind: 'none', raw: outcome.tried[0] || '', detected: candidates });
      } catch (e) {
        console.log('[LENS] lookup failure:', e?.message || String(e));
        setLoading(false);
        setResult({ kind: 'error', message: e?.message || 'Search failed. Check your connection and try again.' });
      }
      return;
    }

    // 5. Neither OCR nor visual search produced anything usable at all. An
    //    OCR failure is the actionable one (move closer / dev build), so it
    //    is reported ahead of the visual service being unavailable.
    setLoading(false);
    if (!ocr.ok) setResult({ kind: 'ocr-failed', message: ocr.message, devBuildRequired: ocr.devBuildRequired });
    else if (!visual.ok) setResult({ kind: 'visual-unavailable', message: visual.message, notConfigured: visual.notConfigured, readText });
    else setResult({ kind: 'none', raw: '' });
  };

  const captureLensPhoto = async () => {
    if (!cameraRef.current || capturingRef.current) return;
    capturingRef.current = true;
    try {
      // Quality kept high (not heavily compressed) and unprocessed so OCR has
      // enough resolution to read small printed label text.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) runLensCapture(photo.uri);
    } catch (e) {
      notify('Capture failed', e?.message || 'Could not take the photo. Try again.');
    } finally {
      capturingRef.current = false;
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('Permission needed', 'Allow photo library access to pick an image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
    if (!res.canceled && res.assets?.[0]?.uri) runLensCapture(res.assets[0].uri);
  };

  // Fallback-only entry point — reached from the "Enter Manually" button on
  // an ocr-failed/no-match result, or the standalone search icon in the
  // live-camera controls.
  const openManualEntry = () => {
    setResult(null);
    setShowManualEntry(true);
  };

  const confirmManualShot = () => {
    const text = manualText.trim();
    if (!text) return;
    setShowManualEntry(false);
    setScanned(true);
    setLoading(true);
    setLoadingStage('Searching GGFIX…');
    runSearch(text);
  };

  // ── permission gates (same pattern as the existing ScanQrCodeScreen) ─────
  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={BRIGHT} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
        <ScanHeader title={isLens ? 'Visual Device Scanner' : 'Scan QR or Barcode'} onBack={() => navigation.goBack()} light />
        <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: rs(28) }}>
          <View className="items-center justify-center" style={{ height: rs(64), width: rs(64), borderRadius: rs(32), backgroundColor: '#FEF3C7', marginBottom: rs(16) }}>
            <CameraIcon size={rf(28)} color="#B45309" />
          </View>
          <Text className="font-extrabold text-center" style={{ fontSize: 15 }}>Camera access is required to scan.</Text>
          <Text className="text-center" style={{ fontSize: 12, color: '#667085', marginTop: rs(8), lineHeight: rf(18) }}>
            GGFIX needs your camera to scan QR codes, barcodes and devices.
          </Text>
          <View className="flex-row" style={{ marginTop: rs(22) }}>
            <Pressable onPress={() => navigation.goBack()} style={{ paddingHorizontal: rs(20), paddingVertical: rs(12), borderRadius: rs(14), borderWidth: 1, borderColor: '#DCE7E2', marginRight: rs(10) }}>
              <Text className="font-bold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings?.())}
              style={{ paddingHorizontal: rs(20), paddingVertical: rs(12), borderRadius: rs(14), backgroundColor: ACCENT }}
            >
              <Text className="text-white font-bold">{permission.canAskAgain ? 'Grant Camera' : 'Open Settings'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const showSheet = scanned || showManualEntry;

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={showSheet ? undefined : handleBarcode}
        onCameraReady={() => console.log('[QR] camera mounted')}
        onMountError={(e) => console.log('[QR] camera mount error:', e?.message || String(e))}
      />

      {/* Header overlay */}
      <View className="absolute left-0 right-0 top-0 flex-row items-center" style={{ paddingTop: rs(48), paddingHorizontal: rs(16), paddingBottom: rs(12), backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <Pressable onPress={() => navigation.goBack()} className="items-center justify-center" style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: 'rgba(255,255,255,0.15)', marginRight: rs(12) }}>
          <ChevronLeft size={rf(22)} color="#FFFFFF" />
        </Pressable>
        <Text className="flex-1 text-white font-extrabold" style={{ fontSize: 17 }} numberOfLines={1}>
          {isLens ? 'Visual Device Scanner' : 'Scan QR or Barcode'}
        </Text>
        <Pressable onPress={() => setTorchOn((v) => !v)} className="items-center justify-center" style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: 'rgba(255,255,255,0.15)' }}>
          {torchOn ? <ZapOff size={rf(19)} color="#FFFFFF" /> : <Zap size={rf(19)} color="#FFFFFF" />}
        </Pressable>
      </View>

      {/* Frame + helper text (hidden once a sheet is up) */}
      {!showSheet ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View style={{ width: rs(250), height: rs(250) }}>
            {[0, 1, 2, 3].map((i) => {
              const borders = {
                borderTopWidth: i < 2 ? 4 : 0,
                borderBottomWidth: i >= 2 ? 4 : 0,
                borderLeftWidth: i % 2 === 0 ? 4 : 0,
                borderRightWidth: i % 2 === 1 ? 4 : 0,
              };
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    top: i < 2 ? 0 : null,
                    bottom: i >= 2 ? 0 : null,
                    left: i % 2 === 0 ? 0 : null,
                    right: i % 2 === 1 ? 0 : null,
                    width: rs(40), height: rs(40), borderColor: BRIGHT, ...borders,
                  }}
                />
              );
            })}
          </View>
          <View className="flex-row items-center" style={{ marginTop: rs(20), paddingHorizontal: rs(30) }}>
            {isLens ? <ScanSearch size={rf(15)} color="#FFFFFF" /> : <ScanLine size={rf(15)} color="#FFFFFF" />}
            <Text className="text-white font-extrabold text-center" style={{ marginLeft: rs(7), fontSize: 12 }}>
              {isLens
                ? 'Point the camera at the device, label, model number or barcode.'
                : 'Align the QR code or barcode inside the frame'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Bottom controls — capture / gallery / manual search, hidden once a sheet is up */}
      {!showSheet ? (
        <View className="absolute left-0 right-0 items-center" style={{ bottom: rs(36) }}>
          {isLens ? (
            <View className="flex-row items-center">
              <Pressable onPress={pickFromGallery} className="items-center justify-center" style={{ height: rs(48), width: rs(48), borderRadius: rs(24), backgroundColor: 'rgba(255,255,255,0.18)', marginRight: rs(22) }}>
                <ImagePlus size={rf(21)} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={captureLensPhoto} className="items-center justify-center" style={{ height: rs(68), width: rs(68), borderRadius: rs(34), backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: BRIGHT }}>
                <View className="items-center justify-center" style={{ height: rs(52), width: rs(52), borderRadius: rs(26), backgroundColor: BRIGHT }}>
                  <CameraIcon size={rf(24)} color="#FFFFFF" />
                </View>
              </Pressable>
              <Pressable onPress={openManualEntry} className="items-center justify-center" style={{ height: rs(48), width: rs(48), borderRadius: rs(24), backgroundColor: 'rgba(255,255,255,0.18)', marginLeft: rs(22) }}>
                <SearchIcon size={rf(19)} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={openManualEntry}
              className="flex-row items-center rounded-full"
              style={{ paddingHorizontal: rs(18), paddingVertical: rs(11), backgroundColor: 'rgba(255,255,255,0.18)' }}
            >
              <SearchIcon size={rf(15)} color="#FFFFFF" />
              <Text className="text-white font-extrabold" style={{ marginLeft: rs(8), fontSize: 13 }}>Search manually</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Manual-entry sheet — fallback only: reached from "Search manually" or
          from an ocr-failed/no-match result's "Enter Manually" button. */}
      {showManualEntry ? (
        <View className="absolute left-0 right-0 bottom-0" style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), padding: rs(18) }}>
          <View className="flex-row items-center" style={{ marginBottom: rs(12) }}>
            {ocrPhotoUri ? (
              <Image source={{ uri: ocrPhotoUri }} style={{ width: rs(56), height: rs(56), borderRadius: rs(14), marginRight: rs(12) }} />
            ) : null}
            <View className="flex-1">
              <Text className="font-extrabold" style={{ fontSize: 13 }}>Search manually</Text>
              <Text style={{ fontSize: 11, color: '#667085', marginTop: rs(2) }}>
                Type the model, brand, IMEI or tracking ID and it'll search GGFIX for you.
              </Text>
            </View>
          </View>
          <TextInput
            value={manualText}
            onChangeText={setManualText}
            autoFocus
            placeholder="e.g. iPhone 11 Pro A2215, or CSPEN1014799"
            placeholderTextColor="#8FA08F"
            returnKeyType="search"
            onSubmitEditing={confirmManualShot}
            style={{ borderWidth: 1, borderColor: '#DCE7E2', borderRadius: rs(14), paddingHorizontal: rs(14), paddingVertical: rs(12), fontSize: 13 }}
          />
          <View className="flex-row" style={{ marginTop: rs(14) }}>
            <Pressable onPress={reset} style={{ paddingHorizontal: rs(18), paddingVertical: rs(12), borderRadius: rs(14), borderWidth: 1, borderColor: '#DCE7E2', marginRight: rs(10) }}>
              <Text className="font-bold">{ocrPhotoUri ? 'Retake' : 'Cancel'}</Text>
            </Pressable>
            <Pressable
              onPress={confirmManualShot}
              disabled={!manualText.trim()}
              style={{ flex: 1, alignItems: 'center', paddingVertical: rs(13), borderRadius: rs(14), backgroundColor: ACCENT, opacity: manualText.trim() ? 1 : 0.5 }}
            >
              <Text className="text-white font-extrabold">Search GGFIX</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Result / loading / no-match sheet */}
      {scanned && !showManualEntry ? (
        <View className="absolute left-0 right-0 bottom-0" style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), paddingBottom: rs(26), maxHeight: '78%' }}>
          {loading ? (
            <View className="items-center justify-center" style={{ paddingVertical: rs(40) }}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text className="font-semibold" style={{ color: '#667085', fontSize: 12, marginTop: rs(12) }}>{loadingStage}</Text>
            </View>
          ) : (
            <ResultBody
              result={result}
              onOpenTicket={openTicket}
              onOpenPickup={openPickup}
              onOpenVisualMatch={openVisualMatch}
              onViewSimilar={viewSimilarMatches}
              onPickDevice={pickCatalogueDevice}
              onSearchManually={searchManually}
              onEnterManually={openManualEntry}
              onScanAgain={reset}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

function ResultBody({ result, onOpenTicket, onOpenPickup, onOpenVisualMatch, onViewSimilar, onPickDevice, onSearchManually, onEnterManually, onScanAgain }) {
  if (!result) return null;

  // Catalogue models matched from the text on the device (brand / model
  // number) — shown when image matching can't answer.
  if (result.kind === 'text-matches') {
    const top = result.best;
    const others = (result.rows || []).filter((r) => !top || r.modelId !== top.modelId);
    const byNumber = result.matchedOn === 'modelNumber';
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: rs(18) }}>
        <Text className="font-extrabold" style={{ fontSize: 13, marginBottom: rs(2) }}>Possible models</Text>
        <Text style={{ fontSize: 11, color: '#667085', marginBottom: rs(12) }}>
          {byNumber
            ? 'Models carrying the model number read from the photo — pick yours.'
            : result.source === 'google'
              ? `Looks like a ${result.brandName} device — pick the model.`
              : `Read "${result.brandName}" on the device — pick the model.`}
        </Text>

        {top ? (
          <Pressable
            onPress={() => onPickDevice(top)}
            className="flex-row items-center"
            style={{ borderWidth: 1.5, borderColor: BRIGHT, borderRadius: rs(18), padding: rs(13), backgroundColor: MINT, marginBottom: rs(8) }}
          >
            <View className="items-center justify-center overflow-hidden" style={{ height: rs(56), width: rs(56), borderRadius: rs(14), backgroundColor: '#FFFFFF', marginRight: rs(12) }}>
              {top.modelImageUrl ? <Image source={{ uri: top.modelImageUrl }} style={{ width: '86%', height: '86%' }} resizeMode="contain" /> : <Smartphone size={rf(22)} color={ACCENT} />}
            </View>
            <View className="flex-1">
              <View style={{ alignSelf: 'flex-start', backgroundColor: BRIGHT, borderRadius: rs(8), paddingHorizontal: rs(8), paddingVertical: rs(2) }}>
                <Text className="text-white font-extrabold" style={{ fontSize: 9 }}>BEST MATCH</Text>
              </View>
              <Text className="font-extrabold" style={{ fontSize: 13, marginTop: rs(4) }} numberOfLines={1}>{top.displayName}</Text>
              <Text style={{ fontSize: 11, color: '#667085' }} numberOfLines={1}>{[top.categoryName, top.modelNumber].filter(Boolean).join(' · ') || 'Device'}</Text>
            </View>
            <ChevronRight size={rf(18)} color={ACCENT} />
          </Pressable>
        ) : null}

        {others.slice(0, 8).map((m) => (
          <Pressable key={m.modelId} onPress={() => onPickDevice(m)} className="flex-row items-center" style={{ paddingVertical: rs(9), borderTopWidth: 1, borderTopColor: '#F0F4F2' }}>
            <View className="items-center justify-center overflow-hidden" style={{ height: rs(40), width: rs(40), borderRadius: rs(11), backgroundColor: MINT, marginRight: rs(10) }}>
              {m.modelImageUrl ? <Image source={{ uri: m.modelImageUrl }} style={{ width: '86%', height: '86%' }} resizeMode="contain" /> : <Smartphone size={rf(17)} color={ACCENT} />}
            </View>
            <View className="flex-1">
              <Text className="font-bold" style={{ fontSize: 12 }} numberOfLines={1}>{m.displayName}</Text>
              <Text style={{ fontSize: 10.5, color: '#667085' }} numberOfLines={1}>{[m.categoryName, m.modelNumber].filter(Boolean).join(' · ') || 'Device'}</Text>
            </View>
            <ChevronRight size={rf(15)} color="#98A9A2" />
          </Pressable>
        ))}

        {!byNumber && result.brandName ? (
          <Pressable onPress={() => onSearchManually(result.brandName)} className="flex-row items-center justify-center" style={{ marginTop: rs(12), backgroundColor: ACCENT, borderRadius: rs(16), paddingVertical: rs(13) }}>
            <Text className="text-white font-extrabold">Show all {result.total} {result.brandName} models</Text>
            <ChevronRight size={rf(16)} color="#FFFFFF" style={{ marginLeft: rs(6) }} />
          </Pressable>
        ) : null}
        {!byNumber ? (
          <Text className="text-center" style={{ fontSize: 10.5, color: '#667085', marginTop: rs(10), lineHeight: rf(15) }}>
            Tip: photograph the model number label (e.g. SM-G950F) for an exact match.
          </Text>
        ) : null}

        <Pressable onPress={onEnterManually} style={{ marginTop: rs(12), paddingVertical: rs(12), alignItems: 'center', borderRadius: rs(14), borderWidth: 1, borderColor: '#DCE7E2' }}>
          <Text className="font-bold" style={{ color: ACCENT }}>None of these — search manually</Text>
        </Pressable>
        <Pressable onPress={onScanAgain} style={{ marginTop: rs(6), paddingVertical: rs(10), alignItems: 'center' }}>
          <Text className="font-bold" style={{ color: '#667085' }}>Scan again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (result.kind === 'device-found') {
    const d = result.best;
    const hasSimilar = result.matches.length > 1;
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: rs(18) }}>
        <View className="items-center" style={{ marginBottom: rs(4) }}>
          <View className="items-center justify-center" style={{ height: rs(28), width: rs(28), borderRadius: rs(14), backgroundColor: MINT, marginBottom: rs(8) }}>
            <BadgeCheck size={rf(15)} color={BRIGHT} />
          </View>
          <Text className="font-extrabold" style={{ fontSize: 13 }}>Device Found</Text>
          {result.label ? (
            <Text style={{ fontSize: 10.5, color: '#667085', marginTop: rs(2) }} numberOfLines={1}>Recognised as “{result.label}”</Text>
          ) : null}
        </View>

        <View className="items-center justify-center overflow-hidden self-center" style={{ height: rs(120), width: rs(120), borderRadius: rs(18), backgroundColor: MINT, marginTop: rs(10), marginBottom: rs(12) }}>
          {d.imageUrl ? <Image source={{ uri: d.imageUrl }} style={{ width: '82%', height: '82%' }} resizeMode="contain" /> : <Smartphone size={rf(34)} color={ACCENT} />}
        </View>

        <Text className="font-bold text-center" style={{ fontSize: 12, color: '#667085' }}>{d.brand}</Text>
        <Text className="font-extrabold text-center" style={{ fontSize: 15, marginTop: rs(2) }}>{d.modelName}</Text>
        {(d.colors && d.colors.length) || d.modelCode ? (
          <Text className="text-center" style={{ fontSize: 12, color: '#667085', marginTop: rs(6) }}>
            {[d.colors && d.colors.length ? `Color: ${d.colors.join(', ')}` : null, d.modelCode ? `SKU: ${d.modelCode}` : null].filter(Boolean).join('   ·   ')}
          </Text>
        ) : null}

        {typeof d.similarity === 'number' ? (
          <View className="self-center flex-row items-center" style={{ marginTop: rs(10), backgroundColor: MINT, borderRadius: rs(10), paddingHorizontal: rs(12), paddingVertical: rs(5) }}>
            <Text className="font-extrabold" style={{ fontSize: 11, color: ACCENT }}>Match confidence: {Math.round(d.similarity * 100)}%</Text>
          </View>
        ) : null}

        <Pressable onPress={() => onOpenVisualMatch(d)} style={{ marginTop: rs(20), backgroundColor: ACCENT, borderRadius: rs(16), paddingVertical: rs(14), alignItems: 'center' }}>
          <Text className="text-white font-extrabold">Use This Device</Text>
        </Pressable>
        {hasSimilar ? (
          <Pressable onPress={() => onViewSimilar(result.matches)} style={{ marginTop: rs(10), paddingVertical: rs(12), alignItems: 'center', borderRadius: rs(14), borderWidth: 1, borderColor: '#DCE7E2' }}>
            <Text className="font-bold" style={{ color: ACCENT }}>View Similar Matches</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onScanAgain} style={{ marginTop: rs(8), paddingVertical: rs(10), alignItems: 'center' }}>
          <Text className="font-bold" style={{ color: '#667085' }}>Scan Again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (result.kind === 'visual-matches') {
    const [best, ...rest] = result.matches;
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: rs(18) }}>
        <Text className="font-extrabold" style={{ fontSize: 13, marginBottom: rs(2) }}>Visual matches</Text>
        <Text style={{ fontSize: 11, color: '#667085', marginBottom: rs(14) }}>
          {result.label ? `Recognised as “${result.label}”. ` : ''}Closest matches from the GGFIX device catalogue — confirm before opening.
        </Text>

        <Pressable
          onPress={() => onOpenVisualMatch(best)}
          className="flex-row items-center"
          style={{ borderWidth: 1.5, borderColor: BRIGHT, borderRadius: rs(18), padding: rs(13), backgroundColor: MINT }}
        >
          <View className="items-center justify-center overflow-hidden" style={{ height: rs(56), width: rs(56), borderRadius: rs(14), backgroundColor: '#FFFFFF', marginRight: rs(12) }}>
            {best.imageUrl ? <Image source={{ uri: best.imageUrl }} style={{ width: '86%', height: '86%' }} resizeMode="contain" /> : <Smartphone size={rf(22)} color={ACCENT} />}
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <View style={{ backgroundColor: BRIGHT, borderRadius: rs(8), paddingHorizontal: rs(8), paddingVertical: rs(2), marginRight: rs(8) }}>
                <Text className="text-white font-extrabold" style={{ fontSize: 9 }}>BEST MATCH</Text>
              </View>
              {typeof best.similarity === 'number' ? (
                <Text className="font-bold" style={{ fontSize: 10.5, color: ACCENT }}>{Math.round(best.similarity * 100)}% match</Text>
              ) : null}
            </View>
            <Text className="font-extrabold" style={{ fontSize: 13, marginTop: rs(4) }} numberOfLines={1}>{best.displayName}</Text>
            <Text style={{ fontSize: 11, color: '#667085' }} numberOfLines={1}>{[best.categoryName, best.modelCode].filter(Boolean).join(' · ') || 'Device'}</Text>
          </View>
          <ChevronRight size={rf(18)} color={ACCENT} />
        </Pressable>

        {rest.length ? (
          <View style={{ marginTop: rs(14) }}>
            <Text className="uppercase font-bold" style={{ fontSize: 9.5, color: '#667085', letterSpacing: 0.5, marginBottom: rs(6) }}>Other possible matches</Text>
            {rest.slice(0, 4).map((m) => (
              <Pressable key={m.id} onPress={() => onOpenVisualMatch(m)} className="flex-row items-center" style={{ paddingVertical: rs(9), borderTopWidth: 1, borderTopColor: '#F0F4F2' }}>
                <View className="items-center justify-center overflow-hidden" style={{ height: rs(40), width: rs(40), borderRadius: rs(11), backgroundColor: MINT, marginRight: rs(10) }}>
                  {m.imageUrl ? <Image source={{ uri: m.imageUrl }} style={{ width: '86%', height: '86%' }} resizeMode="contain" /> : <Smartphone size={rf(17)} color={ACCENT} />}
                </View>
                <View className="flex-1">
                  <Text className="font-bold" style={{ fontSize: 12 }} numberOfLines={1}>{m.displayName}</Text>
                  <Text style={{ fontSize: 10.5, color: '#667085' }} numberOfLines={1}>
                    {typeof m.similarity === 'number' ? `${Math.round(m.similarity * 100)}% match` : 'Possible match'}
                  </Text>
                </View>
                <ChevronRight size={rf(15)} color="#98A9A2" />
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable onPress={onEnterManually} style={{ marginTop: rs(16), paddingVertical: rs(12), alignItems: 'center', borderRadius: rs(14), borderWidth: 1, borderColor: '#DCE7E2' }}>
          <Text className="font-bold" style={{ color: ACCENT }}>None of these — search manually</Text>
        </Pressable>
        <Pressable onPress={onScanAgain} style={{ marginTop: rs(6), paddingVertical: rs(10), alignItems: 'center' }}>
          <Text className="font-bold" style={{ color: '#667085' }}>Scan again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (result.kind === 'visual-unavailable') {
    return (
      <View className="items-center" style={{ paddingHorizontal: rs(24), paddingVertical: rs(28) }}>
        <View className="items-center justify-center" style={{ width: rs(56), height: rs(56), borderRadius: rs(28), backgroundColor: '#FEF3C7', marginBottom: rs(12) }}>
          <AlertTriangle size={rf(24)} color="#B45309" />
        </View>
        <Text className="font-extrabold text-center" style={{ fontSize: 13 }}>
          {result.notConfigured ? "Couldn't identify this device" : 'Device search failed'}
        </Text>
        <Text className="text-center" style={{ fontSize: 11, color: '#667085', marginTop: rs(6), lineHeight: rf(17) }}>
          {result.notConfigured
            ? 'No brand or model number could be read from this photo. Point the camera at the brand name or the model number label (e.g. SM-G950F), or enter it manually.'
            : (result.message || 'Please try again.')}
        </Text>
        {result.readText ? (
          <Text className="text-center" style={{ fontSize: 10.5, color: '#98A2B3', marginTop: rs(6) }} numberOfLines={2}>
            Read from photo: {result.readText}
          </Text>
        ) : null}
        <View className="flex-row" style={{ marginTop: rs(18) }}>
          <Pressable onPress={onScanAgain} className="flex-row items-center" style={{ borderRadius: rs(16), paddingHorizontal: rs(18), paddingVertical: rs(13), borderWidth: 1, borderColor: '#DCE7E2', marginRight: rs(10) }}>
            <RotateCcw size={rf(15)} color={ACCENT} />
            <Text className="font-extrabold" style={{ marginLeft: rs(7), color: ACCENT }}>Retake</Text>
          </Pressable>
          <Pressable onPress={onEnterManually} className="flex-row items-center" style={{ borderRadius: rs(16), paddingHorizontal: rs(18), paddingVertical: rs(13), backgroundColor: ACCENT }}>
            <SearchIcon size={rf(15)} color="#FFFFFF" />
            <Text className="text-white font-extrabold" style={{ marginLeft: rs(7) }}>Enter Manually</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (result.kind === 'ticket') {
    const t = result.ticket;
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: rs(18) }}>
        <View className="flex-row items-center" style={{ marginBottom: rs(14) }}>
          <View className="items-center justify-center" style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: MINT, marginRight: rs(11) }}>
            <BadgeCheck size={rf(19)} color={ACCENT} />
          </View>
          <View className="flex-1">
            <Text className="font-extrabold" style={{ fontSize: 13 }} numberOfLines={1}>
              {t.deviceDisplayName || t.deviceModelName || 'Booking found'}
            </Text>
            <Text style={{ fontSize: 11, color: '#667085' }}>#{t.trackingId || t.id}</Text>
          </View>
        </View>
        <Pressable onPress={() => onOpenTicket(t)} style={{ backgroundColor: ACCENT, borderRadius: rs(16), paddingVertical: rs(14), alignItems: 'center' }}>
          <Text className="text-white font-extrabold">Open booking</Text>
        </Pressable>
        <Pressable onPress={onScanAgain} style={{ marginTop: rs(10), paddingVertical: rs(12), alignItems: 'center' }}>
          <Text className="font-bold" style={{ color: ACCENT }}>Scan again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (result.kind === 'pickup') {
    const p = result.pickup;
    return (
      <View style={{ padding: rs(18) }}>
        <View className="flex-row items-center" style={{ marginBottom: rs(14) }}>
          <View className="items-center justify-center" style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: MINT, marginRight: rs(11) }}>
            <Truck size={rf(19)} color={ACCENT} />
          </View>
          <View className="flex-1">
            <Text className="font-extrabold" style={{ fontSize: 13 }} numberOfLines={1}>{p.issueSummary || 'Pickup request'}</Text>
            <Text style={{ fontSize: 11, color: '#667085' }}>#{String(p.bookingNumber || p.id || '').replace(/^#+/, '')}</Text>
          </View>
        </View>
        <Pressable onPress={() => onOpenPickup(p)} style={{ backgroundColor: ACCENT, borderRadius: rs(16), paddingVertical: rs(14), alignItems: 'center' }}>
          <Text className="text-white font-extrabold">Open pickup</Text>
        </Pressable>
        <Pressable onPress={onScanAgain} style={{ marginTop: rs(10), paddingVertical: rs(12), alignItems: 'center' }}>
          <Text className="font-bold" style={{ color: ACCENT }}>Scan again</Text>
        </Pressable>
      </View>
    );
  }

  if (result.kind === 'device') {
    const d = result.device;
    return (
      <View style={{ padding: rs(18) }}>
        <View className="flex-row items-center" style={{ marginBottom: rs(14) }}>
          <View className="items-center justify-center overflow-hidden" style={{ height: rs(44), width: rs(44), borderRadius: rs(14), backgroundColor: MINT, marginRight: rs(11) }}>
            {d.modelImageUrl ? <Image source={{ uri: d.modelImageUrl }} style={{ width: '86%', height: '86%' }} resizeMode="contain" /> : <Smartphone size={rf(20)} color={ACCENT} />}
          </View>
          <View className="flex-1">
            <Text className="font-extrabold" style={{ fontSize: 13 }} numberOfLines={1}>{d.displayName}</Text>
            <Text style={{ fontSize: 11, color: '#667085' }} numberOfLines={1}>{[d.categoryName, d.modelNumber].filter(Boolean).join(' · ') || 'Device'}</Text>
          </View>
        </View>
        <Pressable onPress={() => onSearchManually(d.displayName)} style={{ backgroundColor: ACCENT, borderRadius: rs(16), paddingVertical: rs(14), alignItems: 'center' }}>
          <Text className="text-white font-extrabold">Book, sell or buy this device</Text>
        </Pressable>
        <Pressable onPress={onScanAgain} style={{ marginTop: rs(10), paddingVertical: rs(12), alignItems: 'center' }}>
          <Text className="font-bold" style={{ color: ACCENT }}>Scan again</Text>
        </Pressable>
      </View>
    );
  }

  if (result.kind === 'multi') {
    return (
      <View style={{ padding: rs(18) }}>
        <Text className="font-extrabold" style={{ fontSize: 13, marginBottom: rs(4) }}>Matches found</Text>
        <Text style={{ fontSize: 12, color: '#667085', marginBottom: rs(16) }}>
          {result.count} records matched — pick the right one.
        </Text>
        <Pressable onPress={() => onSearchManually(result.query)} className="flex-row items-center" style={{ backgroundColor: ACCENT, borderRadius: rs(16), paddingVertical: rs(14), paddingHorizontal: rs(16), justifyContent: 'center' }}>
          <Text className="text-white font-extrabold">View all matches</Text>
          <ChevronRight size={rf(16)} color="#FFFFFF" style={{ marginLeft: rs(6) }} />
        </Pressable>
        <Pressable onPress={onScanAgain} style={{ marginTop: rs(10), paddingVertical: rs(12), alignItems: 'center' }}>
          <Text className="font-bold" style={{ color: ACCENT }}>Scan again</Text>
        </Pressable>
      </View>
    );
  }

  if (result.kind === 'error') {
    return (
      <View className="items-center" style={{ paddingHorizontal: rs(24), paddingVertical: rs(28) }}>
        <View className="items-center justify-center" style={{ width: rs(56), height: rs(56), borderRadius: rs(28), backgroundColor: '#FEE2E2', marginBottom: rs(12) }}>
          <AlertTriangle size={rf(24)} color="#B91C1C" />
        </View>
        <Text className="font-extrabold text-center" style={{ fontSize: 13 }}>Search failed</Text>
        <Text className="text-center" style={{ fontSize: 11, color: '#667085', marginTop: rs(6) }}>{result.message}</Text>
        <Pressable onPress={onScanAgain} className="flex-row items-center" style={{ marginTop: rs(18), backgroundColor: ACCENT, borderRadius: rs(16), paddingHorizontal: rs(24), paddingVertical: rs(13) }}>
          <RotateCcw size={rf(15)} color="#FFFFFF" />
          <Text className="text-white font-extrabold" style={{ marginLeft: rs(8) }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (result.kind === 'ocr-failed') {
    return (
      <View className="items-center" style={{ paddingHorizontal: rs(24), paddingVertical: rs(28) }}>
        <View className="items-center justify-center" style={{ width: rs(56), height: rs(56), borderRadius: rs(28), backgroundColor: '#FEF3C7', marginBottom: rs(12) }}>
          <AlertTriangle size={rf(24)} color="#B45309" />
        </View>
        <Text className="font-extrabold text-center" style={{ fontSize: 13 }}>Couldn't read device details</Text>
        {result.devBuildRequired ? (
          <Text className="text-center" style={{ fontSize: 11, color: '#667085', marginTop: rs(6), lineHeight: rf(17) }}>
            {result.message}
          </Text>
        ) : (
          <Text className="text-center" style={{ fontSize: 11, color: '#667085', marginTop: rs(6), lineHeight: rf(17) }}>
            Try:{'\n'}• move closer{'\n'}• improve lighting{'\n'}• keep the model label visible
          </Text>
        )}
        <View className="flex-row" style={{ marginTop: rs(18) }}>
          <Pressable onPress={onScanAgain} className="flex-row items-center" style={{ borderRadius: rs(16), paddingHorizontal: rs(18), paddingVertical: rs(13), borderWidth: 1, borderColor: '#DCE7E2', marginRight: rs(10) }}>
            <RotateCcw size={rf(15)} color={ACCENT} />
            <Text className="font-extrabold" style={{ marginLeft: rs(7), color: ACCENT }}>Retake</Text>
          </Pressable>
          <Pressable onPress={onEnterManually} className="flex-row items-center" style={{ borderRadius: rs(16), paddingHorizontal: rs(18), paddingVertical: rs(13), backgroundColor: ACCENT }}>
            <SearchIcon size={rf(15)} color="#FFFFFF" />
            <Text className="text-white font-extrabold" style={{ marginLeft: rs(7) }}>Enter Manually</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // 'none'
  const detectedLines = result.detected
    ? [...result.detected.brands, ...result.detected.modelNames, ...result.detected.modelCodes, ...result.detected.trackingIds]
    : [];
  return (
    <View className="items-center" style={{ paddingHorizontal: rs(24), paddingVertical: rs(28) }}>
      <View className="items-center justify-center" style={{ width: rs(56), height: rs(56), borderRadius: rs(28), backgroundColor: '#FEE2E2', marginBottom: rs(12) }}>
        <AlertTriangle size={rf(24)} color="#B91C1C" />
      </View>
      <Text className="font-extrabold text-center" style={{ fontSize: 13 }}>No matching GGFIX record found</Text>
      <Text className="text-center" style={{ fontSize: 12, color: '#667085', marginTop: rs(6), lineHeight: rf(17) }}>
        {result.raw ? `Couldn't match "${String(result.raw).slice(0, 40)}" to anything in GGFIX.` : "Couldn't match that to anything in GGFIX."}
      </Text>
      {detectedLines.length ? (
        <View style={{ marginTop: rs(12), alignSelf: 'stretch', backgroundColor: '#F7FAF7', borderRadius: rs(14), padding: rs(12) }}>
          <Text className="uppercase font-bold" style={{ fontSize: 9.5, color: '#667085', letterSpacing: 0.5, marginBottom: rs(4) }}>Detected</Text>
          {detectedLines.slice(0, 4).map((line, i) => (
            <Text key={i} className="font-extrabold" style={{ fontSize: 13, color: '#111827' }} numberOfLines={1}>{line}</Text>
          ))}
        </View>
      ) : null}
      <View className="flex-row" style={{ marginTop: rs(18) }}>
        <Pressable onPress={onScanAgain} className="flex-row items-center" style={{ borderRadius: rs(16), paddingHorizontal: rs(18), paddingVertical: rs(13), borderWidth: 1, borderColor: '#DCE7E2', marginRight: rs(10) }}>
          <RotateCcw size={rf(15)} color={ACCENT} />
          <Text className="font-extrabold" style={{ marginLeft: rs(7), color: ACCENT }}>Scan Again</Text>
        </Pressable>
        <Pressable onPress={onEnterManually} className="flex-row items-center" style={{ borderRadius: rs(16), paddingHorizontal: rs(18), paddingVertical: rs(13), backgroundColor: ACCENT }}>
          <SearchIcon size={rf(15)} color="#FFFFFF" />
          <Text className="text-white font-extrabold" style={{ marginLeft: rs(7) }}>Search Manually</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ScanHeader({ title, onBack, light }) {
  return (
    <View className="flex-row items-center" style={{ paddingTop: rs(48), paddingHorizontal: rs(16), paddingBottom: rs(12), backgroundColor: light ? '#FFFFFF' : 'transparent', borderBottomWidth: light ? 1 : 0, borderBottomColor: '#DCE7E2' }}>
      <Pressable onPress={onBack} className="items-center justify-center" style={{ height: rs(40), width: rs(40), borderRadius: rs(20), backgroundColor: MINT, marginRight: rs(12) }}>
        <ChevronLeft size={rf(20)} color={ACCENT} />
      </Pressable>
      <Text className="font-extrabold" style={{ fontSize: 17 }}>{title}</Text>
    </View>
  );
}
