import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScreenHeader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';

// Barcode formats that can carry an IMEI number. Code128 is the most common
// on phone packaging; we include EAN/UPC/datamatrix/qr too so the same screen
// can scan a wider range of stickers without forcing the user to know the type.
const BARCODE_TYPES = [
  'code128', 'code39', 'code93',
  'ean13', 'ean8', 'upc_a', 'upc_e',
  'codabar', 'itf14',
  'datamatrix', 'qr',
];

// IMEI is 14-17 digits (15 is the IMEI proper; 16/17 cover IMEISV and TAC+IMEI).
// We strip whitespace/dashes and validate digit-only + length range.
function normaliseImei(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length >= 14 && digits.length <= 17) return digits;
  return null;
}

export default function ScanImeiScreen({ navigation, route }) {
  const onScan = route?.params?.onScan;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  // useRef so the callback doesn't fire multiple times per detection.
  const handlingRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcode = ({ data, type }) => {
    if (handlingRef.current || scanned) return;
    const imei = normaliseImei(data);
    if (!imei) {
      // Not an IMEI-shaped value — keep scanning silently. (We don't show a
      // toast on every misfire because the camera can detect many codes/sec.)
      return;
    }
    handlingRef.current = true;
    setScanned(true);
    if (typeof onScan === 'function') {
      try { onScan(imei); } catch (_) {}
    }
    navigation.goBack();
  };

  // No permission state yet (first render after requestPermission was called).
  if (!permission) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#087A0A" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Scan IMEI" onBack={() => navigation.goBack()} sticky={false} />
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-16 w-16 rounded-full bg-warning/15 items-center justify-center mb-4">
            <Ionicons name="camera-outline" size={28} color="#F59E0B" />
          </View>
          <Text className="text-text font-extrabold text-[16px] text-center">Camera access needed</Text>
          <Text className="text-text-muted text-[12.5px] text-center mt-2 leading-5">
            We need access to your camera to scan the IMEI barcode on the device or its packaging.
          </Text>
          <View className="flex-row mt-6">
            <Pressable
              onPress={() => navigation.goBack()}
              className="px-5 py-3 rounded-xl bg-card border border-border mr-2"
            >
              <Text className="text-text font-bold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (permission.canAskAgain) {
                  requestPermission();
                } else {
                  // After "Don't ask again", the OS suppresses our prompts.
                  // Send the user to Settings to flip the camera toggle.
                  Linking.openSettings?.();
                }
              }}
              className="px-5 py-3 rounded-xl bg-primary"
            >
              <Text className="text-white font-bold">
                {permission.canAskAgain ? 'Grant Camera' : 'Open Settings'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <ScreenHeader
        title="Scan IMEI"
        onBack={() => navigation.goBack()}
        sticky={false}
        className="bg-black/40"
      />
      <View className="flex-1">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={scanned ? undefined : handleBarcode}
        />

        {/* Cut-out frame + corner brackets */}
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View style={{ width: 280, height: 180 }}>
            {[0, 1, 2, 3].map((i) => {
              const top = i < 2 ? 0 : null;
              const bottom = i >= 2 ? 0 : null;
              const left = i % 2 === 0 ? 0 : null;
              const right = i % 2 === 1 ? 0 : null;
              const borders = {
                borderTopWidth: i < 2 ? 4 : 0,
                borderBottomWidth: i >= 2 ? 4 : 0,
                borderLeftWidth: i % 2 === 0 ? 4 : 0,
                borderRightWidth: i % 2 === 1 ? 4 : 0,
              };
              return (
                <View
                  key={i}
                  style={{ position: 'absolute', top, bottom, left, right, width: 36, height: 36, borderColor: '#16BB05', ...borders }}
                />
              );
            })}
          </View>
          <Text className="text-white text-[13px] font-extrabold mt-6">Align the IMEI barcode in the frame</Text>
          <Text className="text-white/70 text-[11px] mt-1.5 px-8 text-center">
            Tip: dial *#06# on the phone to display its IMEI as a barcode you can scan.
          </Text>
        </View>

        {/* Manual entry escape hatch */}
        <View className="absolute left-0 right-0 bottom-0 px-6 pb-8">
          <Pressable
            onPress={() => navigation.goBack()}
            className="self-center bg-white/15 border border-white/30 rounded-full px-5 py-2"
          >
            <Text className="text-white font-bold text-[12.5px]">Enter manually instead</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
