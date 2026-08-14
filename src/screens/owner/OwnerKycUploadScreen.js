import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Platform, Image, Dimensions,
} from 'react-native';
import {
  Camera, Upload, Check, X, AlertCircle, ShieldCheck, FileText,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { CommonActions } from '@react-navigation/native';
import {
  AppHeader, Card, BottomActionBar, ScreenContainer, useBottomBarInset,
} from '../../components/rnr';
import { tokens } from '../../theme/colors';
import { uploadMedia } from '../../api/masterData';
import { saveOwnerKycDocuments } from '../../api/shops';
import { notify } from '../../components/confirm';

const { width: SCREEN_W } = Dimensions.get('window');
const GUTTER = 12;
const OUTER = 16;
const CARD_W = Math.floor((SCREEN_W - OUTER * 2 - GUTTER) / 2);

// Owner KYC = the shop owner's personal identity documents only. Business
// documents (GST / Udyam) are NOT part of KYC — they belong to the shop.
const DOCS = [
  { key: 'aadharFront', title: 'Aadhar Front', required: true, group: 'identity', icon: ShieldCheck },
  { key: 'aadharBack',  title: 'Aadhar Back',  required: true, group: 'identity', icon: ShieldCheck },
  { key: 'pan',         title: 'PAN Card',     required: true, group: 'tax',      icon: FileText },
];

// Maps a DOCS key <-> the users.kyc_document url field.
const KEY_TO_URL_FIELD = { aadharFront: 'aadharFrontUrl', aadharBack: 'aadharBackUrl', pan: 'panUrl' };

const STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'tax',      label: 'Tax' },
];

function StepRail({ stepState }) {
  return (
    <View className="flex-row items-center px-4 pt-4">
      {STEPS.map((s, idx) => {
        const done = stepState[s.key];
        const isLast = idx === STEPS.length - 1;
        return (
          <React.Fragment key={s.key}>
            <View className="items-center" style={{ width: 70 }}>
              <View
                className={`h-7 w-7 rounded-full items-center justify-center border-2 ${done ? 'bg-primary border-primary' : 'bg-card border-border-strong'}`}
              >
                {done ? <Check size={14} color="#fff" strokeWidth={3} /> : <View className="h-2.5 w-2.5 rounded-full bg-border-strong" />}
              </View>
              <Text className={`text-[10px] font-bold mt-1 ${done ? 'text-primary-dark' : 'text-text-muted'}`}>{s.label}</Text>
            </View>
            {!isLast ? (
              <View className={`flex-1 h-0.5 ${done ? 'bg-primary' : 'bg-border-strong'}`} style={{ marginTop: -14 }} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function DocCard({ doc, file, onPick, onRemove }) {
  const isUploaded = !!file;
  const Icon = doc.icon;
  return (
    <View style={{ width: CARD_W, marginBottom: GUTTER }}>
      <Card padded={false} elevated>
        <View className="flex-row items-center px-3 py-2 border-b border-border">
          <Icon size={14} color={tokens.primary} />
          <Text className="ml-2 flex-1 text-[12px] font-extrabold text-text" numberOfLines={1}>{doc.title}</Text>
          {doc.required ? <Text className="text-danger font-extrabold">*</Text> : null}
        </View>
        <Pressable
          onPress={onPick}
          className={`m-2 border-2 border-dashed items-center justify-center ${isUploaded ? 'border-primary bg-card' : 'border-border-strong bg-surface-muted'}`}
          style={{ borderRadius: 14, minHeight: 130, overflow: 'hidden' }}
        >
          {isUploaded ? (
            <>
              <Image source={{ uri: file.uri }} style={{ width: '100%', height: 130 }} resizeMode="cover" />
              <Pressable
                onPress={onRemove}
                hitSlop={8}
                className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 items-center justify-center"
              >
                <X size={14} color="#fff" />
              </Pressable>
              <View className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-primary flex-row items-center">
                <Check size={10} color="#fff" strokeWidth={3} />
                <Text className="ml-1 text-[10px] font-extrabold text-white">UPLOADED</Text>
              </View>
            </>
          ) : (
            <>
              <View className="h-10 w-10 rounded-full bg-primary items-center justify-center">
                <Upload size={18} color="#fff" />
              </View>
              <Text className="text-[11px] font-extrabold text-text mt-2 px-2 text-center">Tap to upload</Text>
              <Text className="text-[9.5px] text-text-muted mt-0.5 px-2 text-center">JPG, PNG, PDF · Max 5MB</Text>
            </>
          )}
        </Pressable>
      </Card>
    </View>
  );
}

export default function OwnerKycUploadScreen({ navigation, route }) {
  // `existing` is the owner KYC blob { aadharFrontUrl, aadharBackUrl, panUrl, ... }.
  const existing = route?.params?.existing || {};
  const initialFiles = Object.fromEntries(
    DOCS
      .map((d) => {
        const url = existing?.[KEY_TO_URL_FIELD[d.key]];
        return url ? [d.key, { uri: url, __fromServer: true, __serverUrl: url }] : null;
      })
      .filter(Boolean)
  );
  const [files, setFiles] = useState(initialFiles);
  const [submitting, setSubmitting] = useState(false);
  const insetBottom = useBottomBarInset();

  const pickImage = async (key, fromCamera = false) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Permission needed', `Please allow ${fromCamera ? 'camera' : 'photo library'} access to upload.`);
        return;
      }
      const opts = { quality: 0.8, mediaTypes: ['images'] };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setFiles((prev) => ({ ...prev, [key]: result.assets[0] }));
    } catch (e) {
      notify('Could not pick image', e?.message || 'Please try again.', { preset: 'error' });
    }
  };

  const promptUpload = (key) => {
    if (Platform.OS === 'web') { pickImage(key, false); return; }
    Alert.alert('Add document', '', [
      { text: 'Take Photo', onPress: () => pickImage(key, true) },
      { text: 'Choose from Library', onPress: () => pickImage(key, false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const remove = (key) => setFiles((prev) => { const next = { ...prev }; delete next[key]; return next; });

  const identityDone = !!files.aadharFront && !!files.aadharBack;
  const taxDone = !!files.pan;
  const allRequiredDone = identityDone && taxDone;
  const stepState = { identity: identityDone, tax: taxDone };

  const onProceed = async () => {
    if (!allRequiredDone) {
      const missing = [];
      if (!files.aadharFront) missing.push('Aadhar Card Front');
      if (!files.aadharBack)  missing.push('Aadhar Card Back');
      if (!files.pan)         missing.push('PAN Card');
      notify('Required documents missing', `Please upload: ${missing.join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      // Build the owner KYC blob { aadharFrontUrl, aadharBackUrl, panUrl }.
      const payload = {};
      for (const doc of DOCS) {
        const asset = files[doc.key];
        const field = KEY_TO_URL_FIELD[doc.key];
        if (!asset?.uri) continue;
        if (asset.__fromServer && asset.__serverUrl) {
          payload[field] = asset.__serverUrl;
          continue;
        }
        // Never persist the device-local file:// URI — the server/admin can't
        // resolve it. If the upload fails, abort the whole submit so
        // the owner isn't told KYC succeeded with an unusable document.
        const hostedUrl = await uploadMedia(asset, 'owner-kyc');
        if (!hostedUrl) {
          throw new Error(`Couldn't upload ${doc.title}. Please check your connection and try again.`);
        }
        payload[field] = hostedUrl;
      }

      await saveOwnerKycDocuments(payload);

      notify('Submitted', 'KYC documents submitted successfully. Admin will review them shortly.', { preset: 'done' });
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'OwnerTabs', state: { routes: [{ name: 'MyAccount' }] } },
            { name: 'OwnerKycView', params: { fromSubmit: true } },
          ],
        })
      );
    } catch (e) {
      notify('Submit failed', e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <AppHeader title="KYC Verification" subtitle="Submit your business documents" onBack={() => navigation.goBack()} />
      <StepRail stepState={stepState} />

      <ScrollView contentContainerStyle={{ padding: OUTER, paddingBottom: insetBottom + 96 }}>
        <View className="flex-row flex-wrap justify-between mt-2">
          {DOCS.map((doc) => (
            <DocCard
              key={doc.key}
              doc={doc}
              file={files[doc.key]}
              onPick={() => promptUpload(doc.key)}
              onRemove={() => remove(doc.key)}
            />
          ))}
        </View>

        <Card className="mt-2 bg-attention-soft border-attention">
          <View className="flex-row items-start">
            <AlertCircle size={16} color={tokens.attention} />
            <View className="ml-2 flex-1">
              <Text className="text-[12px] font-extrabold text-attention-dark">Owner identity documents</Text>
              <Text className="text-[11px] text-text-muted mt-0.5 leading-4">
                Upload your Aadhar (front &amp; back) and PAN card. These are the shop owner's
                personal KYC documents.
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>

      <BottomActionBar
        title={submitting ? 'Uploading...' : allRequiredDone ? 'Submit' : 'Continue'}
        onPress={onProceed}
        loading={submitting}
        disabled={submitting}
        insetBottom={insetBottom}
      />
    </ScreenContainer>
  );
}
