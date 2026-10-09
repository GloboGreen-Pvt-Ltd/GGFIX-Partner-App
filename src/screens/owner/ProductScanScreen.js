import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft, Zap, ZapOff, ImageUp, Keyboard as KeyboardIcon, Camera,
  Smartphone, SearchX, RotateCcw, Wrench, Tag, ShoppingBag,
} from 'lucide-react-native';
import { rf } from '../../utils/responsive';
import { detectProductFromPhoto, warmProductDetect } from '../../lib/productDetect';
import { navigateDeviceAction } from '../../utils/deviceActions';

/**
 * "Search product by camera" — same screen and flow as the Customer app's
 * product scanner: photo → best match + Repair / Sell / Buy, up to three other
 * close matches, take another photo. Recognition is the shared detector
 * (lib/productDetect — same as the Customer app): OCR model number → catalogue
 * name → Google Vision / visual ranking, with a confidence score; only a high,
 * clear-lead match is auto-selected, otherwise the top 3 are offered. Matches
 * are catalogue rows, so the actions open the Partner flows
 * (utils/deviceActions.js, shared with OwnerSearch).
 */
const GREEN = '#09AD2A';
const INK = '#1E1E1E';
const LINE_SOFT = '#F3F3F3';
const YELLOW = '#F3BF23';
const GREEN_TEXT = '#078F23';
const MINT = '#EAF8EC';
const MUTED = '#6B6B6B';
const LINE = '#E6E6E6';
const HINT = 'Point at the device (the back with the cameras works best) and tap the shutter';

// NOTE: Pressables take plain style objects only — NativeWind's cssInterop
// drops function-form `style={({ pressed }) => ...}` on native.
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

function Head({ icon: Icon, title, sub, img }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
      <View style={{ height: 46, width: 46, borderRadius: 12, backgroundColor: img ? '#FFFFFF' : MINT, borderWidth: 1, borderColor: LINE_SOFT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 10 }}>
        {img ? <Image source={{ uri: img }} style={{ width: 42, height: 42 }} resizeMode="contain" /> : <Icon size={20} color={GREEN_TEXT} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: rf(14), fontWeight: '800', color: INK }} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={{ fontSize: rf(11.5), color: MUTED, marginTop: 1 }} numberOfLines={2}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function ProductScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [result, setResult] = useState(null); // { state: 'identifying' | 'product' | 'notFound', ... }
  const lockRef = useRef(false);
  const camRef = useRef(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.status === 'undetermined' && permission.canAskAgain !== false) requestPermission();
  }, [permission, requestPermission]);

  // Build the catalogue index before the first photo.
  useEffect(() => { warmProductDetect(); }, []);

  const reset = () => { lockRef.current = false; setResult(null); };
  const typeInstead = (prefillQuery) => navigation.replace('OwnerSearch', prefillQuery ? { prefillQuery } : undefined);
  const act = (key, row) => navigateDeviceAction(navigation, key, row);

  const identify = async (uri, dims) => {
    lockRef.current = true;
    setResult({ state: 'identifying' });
    try {
      const r = await detectProductFromPhoto(uri, dims);
      const list = r.status === 'none' ? (r.suggestions || []) : r.candidates;
      if (!list.length) {
        // Nothing to offer: search what was recognised (e.g. "Samsung Galaxy
        // S23") rather than guessing a device.
        if (r.label) { lockRef.current = false; return typeInstead(String(r.label)); }
        return setResult({ state: 'notFound', message: "Couldn't recognise this product. Fill the frame with the device (or its box label) in good light and try again, or type its name." });
      }
      return setResult({
        state: 'product',
        // 'low' = not identified; the closest models are offered to pick from.
        confidence: r.status === 'exact' ? 'high' : r.status === 'choose' ? 'medium' : 'low',
        items: list.map((c) => ({ row: c.ref, match: { id: c.id }, score: c.confidence })),
        pick: 0,
        label: r.label || null,
      });
    } catch (_) {
      return setResult({ state: 'notFound', message: "Can't reach the product recognition service. Check your connection and try again, or type the name." });
    }
  };

  const capture = async () => {
    if (lockRef.current || !camRef.current || !camReady) return;
    lockRef.current = true;
    setResult({ state: 'identifying' });
    try {
      const pic = await camRef.current.takePictureAsync({ quality: 0.6 });
      if (!pic?.uri) throw new Error('no photo');
      await identify(pic.uri, { width: pic.width, height: pic.height });
    } catch (_) {
      setResult({ state: 'notFound', message: "Couldn't take the photo. Please try again." });
    }
  };

  const fromGallery = async () => {
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
      if (pick.canceled || !pick.assets?.[0]?.uri) return;
      await identify(pick.assets[0].uri, { width: pick.assets[0].width, height: pick.assets[0].height });
    } catch (_) {
      lockRef.current = false;
    }
  };

  const granted = !!permission?.granted;

  // ── result card (bottom sheet) ──
  const renderResult = () => {
    const r = result;
    if (r.state === 'identifying') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}>
          <ActivityIndicator color={GREEN} />
          <Text style={{ marginLeft: 9, fontSize: rf(13), fontWeight: '700', color: INK }}>Identifying product…</Text>
        </View>
      );
    }
    if (r.state === 'product') {
      const cur = r.items[r.pick] || r.items[0];
      const d = cur.row;
      const sure = r.confidence === 'high' && r.pick === 0;
      return (
        <>
          <Head icon={Smartphone} title={d.displayName || d.modelName} sub={r.confidence === 'low'
            ? (r.label ? `Recognised ${r.label} — pick your exact model` : "Couldn't identify exactly — pick your device below")
            : `${sure ? 'Product found' : r.items.length > 1 ? 'Pick your device — closest matches' : 'Best match — check this is your device'} · ${Math.round((cur.score || 0) * 100)}% match`} img={d.modelImageUrl} />
          <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
            <SheetButton primary icon={Wrench} label="Repair" onPress={() => act('BOOK', d)} />
            {d.sellActive !== false ? <SheetButton icon={Tag} label="Sell" onPress={() => act('SELL', d)} /> : null}
            <SheetButton icon={ShoppingBag} label="Buy" onPress={() => act('BUY', d)} />
          </View>
          {r.items.length > 1 ? (
            <>
              <Text style={{ marginTop: 12, marginBottom: 6, fontSize: rf(11), fontWeight: '700', color: MUTED }}>Not this one? Other close matches</Text>
              <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
                {r.items.map((it, i) => (i === r.pick ? null : (
                  <Pressable
                    key={it.match.id}
                    onPress={() => setResult({ ...r, pick: i })}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${it.row.displayName || it.row.modelName}`}
                    className="active:opacity-80"
                    style={{ flex: 1, marginHorizontal: 3, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1, borderColor: LINE }}
                  >
                    {it.row.modelImageUrl
                      ? <Image source={{ uri: it.row.modelImageUrl }} style={{ width: 34, height: 34 }} resizeMode="contain" />
                      : <Smartphone size={20} color={GREEN_TEXT} />}
                    <Text numberOfLines={2} style={{ marginTop: 3, fontSize: rf(9.5), fontWeight: '700', color: INK, textAlign: 'center' }}>{it.row.displayName || it.row.modelName}</Text>
                  </Pressable>
                )))}
              </View>
            </>
          ) : null}
          {/* The recognised name isn't one of these? Search it instead of picking a wrong device. */}
          {!sure && r.label ? (
            <Pressable onPress={() => typeInstead(String(r.label))} accessibilityRole="button" className="active:opacity-70" style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: rf(11.5), fontWeight: '700', color: MUTED }}>
                Not in the list? <Text style={{ color: GREEN_TEXT }}>Search “{String(r.label)}”</Text>
              </Text>
            </Pressable>
          ) : null}
        </>
      );
    }
    // notFound
    return (
      <>
        <Head icon={SearchX} title="No match found" sub={r.message} />
        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
          <SheetButton primary icon={KeyboardIcon} label="Type product name" onPress={() => typeInstead()} />
        </View>
      </>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {granted ? (
        <CameraView
          ref={camRef}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          enableTorch={torch}
          onCameraReady={() => setCamReady(true)}
        />
      ) : null}

      {/* Top bar */}
      <SafeAreaView edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6 }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" className="active:opacity-70"
            style={{ height: 38, width: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <ArrowLeft size={20} color="#FFFFFF" />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: rf(16), fontWeight: '800', color: '#FFFFFF' }}>Search product by camera</Text>
          {granted && Platform.OS !== 'web' ? (
            <Pressable onPress={() => setTorch((t) => !t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={torch ? 'Torch off' : 'Torch on'} className="active:opacity-70"
              style={{ height: 38, width: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: torch ? YELLOW : 'rgba(255,255,255,0.18)' }}>
              {torch ? <Zap size={18} color={INK} /> : <ZapOff size={18} color="#FFFFFF" />}
            </Pressable>
          ) : <View style={{ width: 38 }} />}
        </View>
      </SafeAreaView>

      {/* Viewfinder / permission */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        {granted ? (
          <>
            <View style={{ width: 250, height: 300 }}>
              {[[0, 0], [0, 1], [1, 0], [1, 1]].map(([v, h]) => (
                <View key={`${v}${h}`} style={{
                  position: 'absolute', width: 34, height: 34, borderColor: GREEN,
                  [v ? 'bottom' : 'top']: 0, [h ? 'right' : 'left']: 0,
                  [v ? 'borderBottomWidth' : 'borderTopWidth']: 4, [h ? 'borderRightWidth' : 'borderLeftWidth']: 4,
                  [`border${v ? 'Bottom' : 'Top'}${h ? 'Right' : 'Left'}Radius`]: 14,
                }} />
              ))}
            </View>
            <Text style={{ marginTop: 16, fontSize: rf(12.5), color: '#FFFFFF', textAlign: 'center', lineHeight: rf(18), textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 }}>{HINT}</Text>
          </>
        ) : permission ? (
          <View style={{ width: '100%', maxWidth: 360, borderRadius: 18, padding: 16, alignItems: 'center', backgroundColor: '#FFFFFF' }}>
            <View style={{ height: 52, width: 52, borderRadius: 26, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={24} color={GREEN_TEXT} />
            </View>
            <Text style={{ marginTop: 10, fontSize: rf(15), fontWeight: '800', color: INK, textAlign: 'center' }}>Allow camera to search</Text>
            <Text style={{ marginTop: 4, fontSize: rf(12), color: MUTED, textAlign: 'center', lineHeight: rf(17) }}>
              GGFIX uses the camera only to identify the device. You can also pick a photo from your gallery.
            </Text>
            <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 14, marginHorizontal: -4 }}>
              {permission.canAskAgain !== false ? (
                <SheetButton primary icon={Camera} label="Allow camera" onPress={requestPermission} />
              ) : (
                <SheetButton primary icon={Camera} label="Open settings" onPress={() => Linking.openSettings?.()} />
              )}
            </View>
          </View>
        ) : (
          <ActivityIndicator color="#FFFFFF" />
        )}
      </View>

      {/* Bottom sheet */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}>
          {result ? (
            <>
              {renderResult()}
              {result.state !== 'identifying' ? (
                <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel="Take another photo" className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 6 }}>
                  <RotateCcw size={14} color={GREEN_TEXT} />
                  <Text style={{ marginLeft: 6, fontSize: rf(12.5), fontWeight: '800', color: GREEN_TEXT }}>Take another photo</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
              <Pressable onPress={fromGallery} accessibilityRole="button" accessibilityLabel="Pick a photo" className="active:opacity-70" style={{ alignItems: 'center', width: 80 }}>
                <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}><ImageUp size={20} color={GREEN_TEXT} /></View>
                <Text style={{ marginTop: 4, fontSize: rf(11), fontWeight: '700', color: INK }}>Gallery</Text>
              </Pressable>
              <Pressable
                onPress={capture}
                disabled={!granted || !camReady}
                accessibilityRole="button"
                accessibilityLabel="Take photo to identify product"
                className="active:opacity-80"
                style={{ height: 70, width: 70, borderRadius: 35, borderWidth: 4, borderColor: GREEN, alignItems: 'center', justifyContent: 'center', opacity: granted && camReady ? 1 : 0.4 }}
              >
                <View style={{ height: 54, width: 54, borderRadius: 27, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={24} color="#FFFFFF" />
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
