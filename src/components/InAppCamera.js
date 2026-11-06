// In-app photo capture (expo-camera) for every "Take Photo" in the app.
//
// Why: ImagePicker.launchCameraAsync opens the system camera app. On Android the
// OS may kill our (Expo Go / app) activity while that camera is in front, so the
// app restarts and reloads when the photo comes back. Capturing inside the app
// keeps it in the foreground.
//
// launchCamera(opts) returns ImagePicker.launchCameraAsync's result shape
// ({ canceled, assets: [{ uri, width, height, fileName, mimeType, type }] }), so
// call sites only swap the function. Videos, web, and a camera that fails to
// start still use the system camera. Callers keep requesting the camera
// permission first (the same OS permission).
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCcw, X } from 'lucide-react-native';

const FALLBACK = Symbol('fallback');
let host = null;

export async function launchCamera(opts = {}) {
  const types = [].concat(opts.mediaTypes || 'images');
  const wantsVideo = types.some((t) => /video/i.test(String(t)));
  if (Platform.OS === 'web' || wantsVideo || !host) return ImagePicker.launchCameraAsync(opts);
  const asset = await host.open({ quality: typeof opts.quality === 'number' ? opts.quality : 0.7 });
  if (asset === FALLBACK) return ImagePicker.launchCameraAsync(opts);
  return asset ? { canceled: false, assets: [asset] } : { canceled: true, assets: null };
}

function RoundButton({ onPress, label, children, size = 52, style }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10}
      style={[{ height: size, width: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }, style]}>
      {children}
    </Pressable>
  );
}

/** Mount once at the app root (next to ToastHost). */
export function CameraHost() {
  const insets = useSafeAreaInsets();
  const cam = useRef(null);
  const [req, setReq] = useState(null); // { quality, resolve }
  const [shot, setShot] = useState(null); // taken photo awaiting "Use Photo"
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState('back');

  useEffect(() => {
    host = {
      open: (o) => new Promise((resolve) => {
        setShot(null);
        setReady(false);
        setBusy(false);
        setReq({ ...o, resolve });
      }),
    };
    return () => { host = null; };
  }, []);

  const finish = (value) => {
    const r = req;
    setReq(null);
    setShot(null);
    setBusy(false);
    r?.resolve(value);
  };

  const capture = async () => {
    if (!cam.current || !ready || busy) return;
    setBusy(true);
    try {
      const pic = await cam.current.takePictureAsync({ quality: req?.quality ?? 0.7 });
      if (pic?.uri) setShot(pic);
    } catch (_) {
      // Keep the camera open; the user can try again or close it.
    } finally {
      setBusy(false);
    }
  };

  const usePhoto = () => finish({
    uri: shot.uri, width: shot.width, height: shot.height, fileName: `photo-${Date.now()}.jpg`, mimeType: 'image/jpeg', type: 'image',
  });

  return (
    <Modal visible={!!req} animationType="slide" statusBarTranslucent onRequestClose={() => (shot ? setShot(null) : finish(null))}>
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {shot ? (
          <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : req ? (
          <CameraView
            ref={cam}
            style={StyleSheet.absoluteFill}
            facing={facing}
            onCameraReady={() => setReady(true)}
            onMountError={() => finish(FALLBACK)}
          />
        ) : null}

        <View style={{ position: 'absolute', top: insets.top + 10, left: 16 }}>
          <RoundButton label="Close camera" size={42} onPress={() => finish(null)}>
            <X size={22} color="#FFFFFF" />
          </RoundButton>
        </View>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
          {shot ? (
            <>
              <Pressable onPress={() => setShot(null)} accessibilityRole="button" accessibilityLabel="Retake"
                style={{ paddingHorizontal: 26, paddingVertical: 13, borderRadius: 28, borderWidth: 1.5, borderColor: '#FFFFFF' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>Retake</Text>
              </Pressable>
              <Pressable onPress={usePhoto} accessibilityRole="button" accessibilityLabel="Use Photo"
                style={{ paddingHorizontal: 26, paddingVertical: 13, borderRadius: 28, backgroundColor: '#01AC77' }}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>Use Photo</Text>
              </Pressable>
            </>
          ) : (
            <>
              <RoundButton label="Switch camera" onPress={() => { setReady(false); setFacing((f) => (f === 'back' ? 'front' : 'back')); }}>
                <RefreshCcw size={22} color="#FFFFFF" />
              </RoundButton>
              <Pressable onPress={capture} disabled={!ready || busy} accessibilityRole="button" accessibilityLabel="Take photo"
                style={{ height: 76, width: 76, borderRadius: 38, borderWidth: 5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: ready ? 1 : 0.5 }}>
                {busy || !ready ? <ActivityIndicator color="#FFFFFF" /> : <View style={{ height: 58, width: 58, borderRadius: 29, backgroundColor: '#FFFFFF' }} />}
              </Pressable>
              <View style={{ width: 52 }} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
