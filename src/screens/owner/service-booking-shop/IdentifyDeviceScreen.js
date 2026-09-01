import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ScanLine, Search, Smartphone, Sparkles, ChevronRight, Hash } from 'lucide-react-native';
import { ScreenHeader } from '../../../components/rnr';
import { notify } from '../../../components/confirm';
import { lookupImei } from '../../../api/imei';
import { resolveDeviceImageSource } from '../../../utils/images';

const ACCENT = '#087A0A';
const ACCENT_DARK = '#087A0A';

// IMEI is 14–17 digits; 15 is the standard IMEI. Keep only digits, cap length.
function cleanImei(raw) {
  return String(raw || '').replace(/[^0-9]/g, '').slice(0, 17);
}

export default function IdentifyDeviceScreen({ navigation, route }) {
  const params = route?.params || {};
  const [imei, setImei] = useState('');
  const [loading, setLoading] = useState(false);
  // Remember the last IMEI we detected on so an accidental double-tap doesn't
  // fire two paid lookups back to back.
  const lastLookedUpRef = useRef('');

  const valid = imei.length >= 14 && imei.length <= 17;

  // Falls back to the normal manual picker, carrying the customer through.
  const goManual = () => navigation.replace('ChooseDevice', {
    customerId: params.customerId,
    customer: params.customer,
  });

  const openScanner = () => {
    navigation.navigate('ScanImei', {
      onScan: (value) => {
        const c = cleanImei(value);
        setImei(c);
        // Auto-run the lookup as soon as a scan lands — the whole point of
        // scanning is to skip typing, so don't make the user tap again.
        if (c.length >= 14 && c.length <= 17) runLookup(c);
      },
    });
  };

  const runLookup = async (value) => {
    const digits = cleanImei(value ?? imei);
    if (digits.length < 14 || digits.length > 17) {
      notify('Enter a valid IMEI', 'An IMEI is 14–17 digits. Dial *#06# to see it, or tap Scan.');
      return;
    }
    if (loading) return;
    lastLookedUpRef.current = digits;
    setLoading(true);
    try {
      const res = await lookupImei(digits);

      // Matched a catalog device → auto-select brand/model and jump straight to
      // the Color / RAM / Storage step (those can't be derived from an IMEI).
      if (res?.matched && res?.device) {
        const d = res.device;
        const modelImageUrl =
          resolveDeviceImageSource({ url: d.imageUrl, base64: d.imageBase64 }) || undefined;
        notify('Device detected', `${d.brandName || ''} ${d.modelName || ''}`.trim(), { preset: 'done' });
        navigation.navigate('DeviceColorStorage', {
          ...params,
          flow: 'BOOKING',
          categoryId: d.categoryId,
          categoryCode: d.categoryCode,
          categoryName: d.categoryName,
          brandId: d.brandId,
          brandName: d.brandName,
          seriesId: d.seriesId,
          modelId: d.modelId,
          modelName: d.modelName,
          modelImageUrl,
          imageUrl: modelImageUrl,
          imei: digits,
        });
        return;
      }

      // Provider identified the phone but it's not in our catalog yet.
      const rawBrand = res?.raw?.brand;
      const rawModel = res?.raw?.model;
      if (rawBrand || rawModel) {
        notify(
          'Not in catalog yet',
          `Detected ${[rawBrand, rawModel].filter(Boolean).join(' ')} — choose the device manually.`,
        );
        goManual();
        return;
      }

      // Lookup not set up / no balance / unreachable — quietly fall back.
      if (res?.configured === false) {
        notify('Manual selection', 'IMEI lookup isn’t enabled — pick the device manually.');
      } else {
        notify('Not recognised', 'Couldn’t identify this IMEI. Choose the device manually.');
      }
      goManual();
    } catch (e) {
      notify('Lookup failed', 'Choose the device manually.');
      goManual();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Identify Device" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View className="items-center mt-2 mb-5">
          <View className="h-16 w-16 rounded-3xl bg-success/10 items-center justify-center mb-3">
            <ScanLine size={30} color={ACCENT} />
          </View>
          <Text className="text-[17px] font-extrabold text-text text-center">Scan or enter the IMEI</Text>
          <Text className="text-[12.5px] text-text-muted text-center mt-1.5 leading-5 px-4">
            We’ll auto-detect the brand and model, then you just pick the colour, RAM and storage.
          </Text>
        </View>

        {/* Scan card */}
        <Pressable
          onPress={openScanner}
          disabled={loading}
          className="rounded-2xl overflow-hidden active:opacity-90 mb-3"
          style={{
            borderWidth: 1.5,
            borderColor: 'rgba(8, 122, 10, 0.35)',
            backgroundColor: 'rgba(8, 122, 10, 0.06)',
          }}
        >
          <View className="flex-row items-center p-4">
            <View className="h-11 w-11 rounded-2xl items-center justify-center mr-3" style={{ backgroundColor: ACCENT }}>
              <ScanLine size={22} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-extrabold text-text">Scan IMEI barcode</Text>
              <Text className="text-[11.5px] text-text-muted mt-0.5">Point the camera at the box or *#06# screen</Text>
            </View>
            <ChevronRight size={18} color={ACCENT_DARK} />
          </View>
        </Pressable>

        {/* Divider */}
        <View className="flex-row items-center my-2">
          <View className="flex-1 h-px bg-border" />
          <Text className="text-[11px] text-text-muted font-bold mx-3">OR ENTER MANUALLY</Text>
          <View className="flex-1 h-px bg-border" />
        </View>

        {/* Manual entry */}
        <View className="bg-card border border-border rounded-2xl p-3.5 mb-4">
          <View className="flex-row items-center mb-2">
            <Hash size={13} color={ACCENT} />
            <Text className="text-[11px] font-extrabold text-text ml-1.5 tracking-wider">IMEI NUMBER</Text>
          </View>
          <View
            className="flex-row items-center rounded-xl px-3"
            style={{ borderWidth: 1, borderColor: '#E2E8E2', backgroundColor: '#FFFFFF' }}
          >
            <Smartphone size={16} color="#8FA08F" />
            <TextInput
              className="flex-1 py-3 ml-2 text-text text-[15px]"
              style={{ letterSpacing: 1 }}
              placeholder="e.g. 356938035643809"
              placeholderTextColor="#8FA08F"
              keyboardType="number-pad"
              value={imei}
              onChangeText={(v) => setImei(cleanImei(v))}
              maxLength={17}
              returnKeyType="search"
              onSubmitEditing={() => valid && runLookup()}
              editable={!loading}
            />
            {imei.length > 0 ? (
              <Text className="text-[11px] font-bold text-text-muted ml-1">{imei.length}</Text>
            ) : null}
          </View>
          <Text className="text-[10.5px] text-text-muted mt-1.5">
            Dial <Text className="font-extrabold text-text">*#06#</Text> on the device to display its IMEI.
          </Text>
        </View>

        {/* Detect button */}
        <Pressable
          onPress={() => runLookup()}
          disabled={!valid || loading}
          className="rounded-2xl overflow-hidden active:opacity-90"
          style={{
            backgroundColor: valid && !loading ? ACCENT : '#8FA08F',
            opacity: valid && !loading ? 1 : 0.7,
          }}
        >
          <View className="flex-row items-center justify-center py-3.5">
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Search size={18} color="#fff" />
            )}
            <Text className="text-white text-[15px] font-extrabold ml-2">
              {loading ? 'Detecting device…' : 'Detect Device'}
            </Text>
          </View>
        </Pressable>

        {/* Manual escape hatch */}
        <Pressable onPress={goManual} disabled={loading} className="mt-4 py-2 active:opacity-70">
          <Text className="text-center text-[13px] font-bold" style={{ color: ACCENT_DARK }}>
            Skip — choose the device manually
          </Text>
        </Pressable>

        {/* Trust strip */}
        <View className="flex-row items-center justify-center mt-5">
          <Sparkles size={13} color="#8FA08F" />
          <Text className="text-[11px] text-text-muted ml-1.5">Powered by IMEI database lookup</Text>
        </View>
      </ScrollView>
    </View>
  );
}
