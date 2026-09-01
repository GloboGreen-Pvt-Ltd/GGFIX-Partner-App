import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Platform, Image, Dimensions,
} from 'react-native';
import { Upload, Check, X, ShieldCheck, FileText } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { CommonActions } from '@react-navigation/native';
import {
  AppHeader, Card, BottomActionBar, ScreenContainer, useBottomBarInset,
} from '../../../components/rnr';
import { tokens } from '../../../theme/colors';
import { uploadMedia } from '../../../api/masterData';
import { ticketApi } from '../../../api/client';
import { notify } from '../../../components/confirm';

const { width: SCREEN_W } = Dimensions.get('window');
const GUTTER = 12;
const OUTER = 16;
const CARD_W = Math.floor((SCREEN_W - OUTER * 2 - GUTTER) / 2);

// Per memory: technician/employee KYC = Aadhar (front+back) + PAN. No business proof.
const DOCS = [
  { key: 'aadharFront', title: 'Aadhar Front', required: true, icon: ShieldCheck },
  { key: 'aadharBack',  title: 'Aadhar Back',  required: true, icon: ShieldCheck },
  { key: 'pan',         title: 'PAN Card',     required: true, icon: FileText },
];

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
              <Text className="text-[9.5px] text-text-muted mt-0.5 px-2 text-center">JPG, PNG · Max 5MB</Text>
            </>
          )}
        </Pressable>
      </Card>
    </View>
  );
}

export default function TechnicianKycUploadScreen({ navigation, route }) {
  const existing = route?.params?.existing || {};
  const initialFiles = Object.fromEntries(
    Object.entries(existing).map(([key, doc]) => [key, { uri: doc.url, __fromServer: true, __serverUrl: doc.url }]),
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

  const allDone = DOCS.every((d) => !!files[d.key]);

  const onSubmit = async () => {
    if (!allDone) {
      notify('Required documents', 'Please upload all 3 documents (Aadhar Front, Aadhar Back, PAN).');
      return;
    }
    setSubmitting(true);
    try {
      const payload = [];
      for (const doc of DOCS) {
        const asset = files[doc.key];
        if (!asset?.uri) continue;
        if (asset.__fromServer && asset.__serverUrl) {
          payload.push({ docType: doc.key, title: doc.title, url: asset.__serverUrl, required: doc.required });
          continue;
        }
        // Never persist the device-local file:// URI — the server/admin can't
        // resolve it. If the upload fails, abort the whole submit so
        // the technician isn't told KYC succeeded with an unusable document.
        const hostedUrl = await uploadMedia(asset, 'technician-kyc');
        if (!hostedUrl) {
          throw new Error(`Couldn't upload ${doc.title}. Please check your connection and try again.`);
        }
        payload.push({ docType: doc.key, title: doc.title, url: hostedUrl, required: doc.required });
      }
      // Per memory [ggfix technician KYC]: endpoint is /technicians/me/kyc-documents
      await ticketApi.post('/technicians/me/kyc-documents', { body: { documents: payload } });
      notify('Submitted', 'KYC submitted for review.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Submit failed', e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <AppHeader title="My KYC" subtitle="Verify your identity" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <ScrollView contentContainerStyle={{ padding: OUTER, paddingBottom: insetBottom + 96 }}>
        <Card>
          <Text className="text-[12px] font-extrabold text-text">Documents needed</Text>
          <Text className="text-[11px] text-text-muted mt-1 leading-4">
            Upload clear photos of your Aadhar (front & back) and PAN card. We use these to verify your employment.
          </Text>
        </Card>
        <View className="h-3" />
        <View className="flex-row flex-wrap justify-between">
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
      </ScrollView>

      <BottomActionBar
        title={submitting ? 'Uploading...' : 'Submit KYC'}
        onPress={onSubmit}
        loading={submitting}
        disabled={submitting || !allDone}
        insetBottom={insetBottom}
      />
    </ScreenContainer>
  );
}
