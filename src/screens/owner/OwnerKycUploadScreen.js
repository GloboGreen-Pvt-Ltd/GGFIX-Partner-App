import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  Upload, Check, X, AlertCircle, ShieldCheck, FileText, Lock,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { CommonActions } from '@react-navigation/native';
import {
  AppHeader, Card, BottomActionBar, ScreenContainer, useBottomBarInset,
} from '../../components/rnr';
import { DocumentPreview } from '../../components/owner/kyc/DocumentPreview';
import { OwnerBadge } from '../../components/owner/kyc/OwnerBadge';
import { tokens } from '../../theme/colors';
import { uploadMedia } from '../../api/masterData';
import { saveOwnerKycDocuments } from '../../api/shops';
import { AUTH_BASE } from '../../api/config';
import { notify } from '../../components/confirm';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// Owner KYC = the shop owner's personal identity documents only. Business
// documents (GST / Udyam) are NOT part of KYC — they belong to the shop.
const DOCS = [
  { key: 'aadharFront', title: 'Aadhaar Card (Front)', required: true, group: 'identity', icon: ShieldCheck },
  { key: 'aadharBack',  title: 'Aadhaar Card (Back)',  required: true, group: 'identity', icon: ShieldCheck },
  { key: 'pan',         title: 'PAN Card',             required: true, group: 'tax',      icon: FileText },
];
const IDENTITY_DOCS = DOCS.filter((d) => d.group === 'identity');
const TAX_DOCS = DOCS.filter((d) => d.group === 'tax');

// Maps a DOCS key <-> the users.kyc_document url field.
const KEY_TO_URL_FIELD = { aadharFront: 'aadharFrontUrl', aadharBack: 'aadharBackUrl', pan: 'panUrl' };

// The generic /master/media/upload endpoint this screen uploads through only
// accepts JPEG/PNG/WebP (see MediaUploadValidator on the backend — PDF is a
// different, unused-by-this-screen endpoint's concern, and the UI must not
// claim support it doesn't have). This is a client-side gate only: the
// backend's magic-byte validator is the real authority and still checks
// every upload regardless, but rejecting an obvious mismatch (HEIC from an
// iPhone, a GIF) here saves a full upload round trip just to be told the
// same thing.
const SUPPORTED_IMAGE_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const SUPPORTED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];
function isSupportedImageAsset(asset) {
  const mime = String(asset?.mimeType || '').toLowerCase();
  if (mime) return SUPPORTED_IMAGE_MIME.includes(mime);
  // asset.mimeType is the only field expo-image-picker guarantees is a real
  // HTTP MIME type — asset.type is a media *category* ("image"), not one, so
  // it's never trusted here. Fall back to the extension only when mimeType
  // is missing entirely.
  const ext = String(asset?.fileName || asset?.uri || '').toLowerCase().split('.').pop();
  return SUPPORTED_IMAGE_EXT.includes(ext);
}

// The real flow has exactly two document groups (identity, tax) — there is no
// separate "review" screen (OwnerKycReview is unreachable dead code; this
// screen saves and jumps straight to OwnerKycView). Keep the step rail
// honest to that instead of inventing a 3rd step.
const STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'tax',      label: 'Tax' },
];

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.10,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

function HeroBanner() {
  return (
    <View style={cardShadow}>
      <LinearGradient
        colors={[tokens.primaryBright, tokens.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20, padding: 16, overflow: 'hidden',
          flexDirection: 'row', alignItems: 'center',
        }}
      >
        <View
          style={{
            position: 'absolute', right: -26, top: -26,
            width: 100, height: 100, borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.10)',
          }}
        />
        <View
          style={{
            width: 46, height: 46, borderRadius: 15,
            backgroundColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
            marginRight: 12,
          }}
        >
          <ShieldCheck size={22} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <View className="flex-1">
          <Text className="text-white text-[15px] font-extrabold">Verify Your Identity</Text>
          <Text className="text-white/85 text-[11.5px] mt-1 leading-4">
            A secure and trusted marketplace starts with verified users.
          </Text>
        </View>
        <View
          style={{
            width: 40, height: 40, borderRadius: 13,
            backgroundColor: 'rgba(255,255,255,0.16)',
            alignItems: 'center', justifyContent: 'center',
            marginLeft: 8,
          }}
        >
          <FileText size={18} color="#FFFFFF" strokeWidth={2} />
        </View>
      </LinearGradient>
    </View>
  );
}

function StepRail({ stepState }) {
  return (
    <View className="flex-row items-center px-1 pt-4 pb-1">
      {STEPS.map((s, idx) => {
        const done = stepState[s.key];
        const isLast = idx === STEPS.length - 1;
        return (
          <React.Fragment key={s.key}>
            <View className="items-center" style={{ width: 72 }}>
              <View
                className={`h-8 w-8 rounded-full items-center justify-center border-2 ${done ? 'bg-primary border-primary' : 'bg-card border-border-strong'}`}
              >
                {done ? <Check size={15} color="#fff" strokeWidth={3} /> : <View className="h-2.5 w-2.5 rounded-full bg-border-strong" />}
              </View>
              <Text className={`text-[10.5px] font-extrabold mt-1.5 ${done ? 'text-primary-dark' : 'text-text-muted'}`}>{s.label}</Text>
            </View>
            {!isLast ? (
              <View className={`flex-1 rounded-full ${done ? 'bg-primary' : 'bg-border'}`} style={{ height: 3, marginTop: -16 }} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function SectionLabel({ title, subtitle }) {
  return (
    <View className="mt-5 mb-2">
      <Text className="text-[14px] font-extrabold text-text">{title}</Text>
      {subtitle ? <Text className="text-[11.5px] text-text-muted mt-0.5 leading-4">{subtitle}</Text> : null}
    </View>
  );
}

function DocCard({ doc, file, onPick, onRemove, index }) {
  const isUploaded = !!file;
  const Icon = doc.icon;
  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(320)}>
      <Card padded={false} elevated>
        <View className="flex-row items-center px-3.5 py-3 border-b border-border">
          <View
            className="h-8 w-8 rounded-lg items-center justify-center mr-2.5"
            style={{ backgroundColor: tokens.primarySoft }}
          >
            <Icon size={15} color={tokens.primary} />
          </View>
          <Text className="flex-1 text-[13px] font-extrabold text-text" numberOfLines={1}>{doc.title}</Text>
          {doc.required ? <Text className="text-danger font-extrabold text-[13px]">*</Text> : null}
        </View>

        {isUploaded ? (
          <View className="m-2.5" style={{ borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
            <DocumentPreview url={file.uri} label={doc.title} height={150} rounded={14} />
            <Pressable
              onPress={onRemove}
              hitSlop={8}
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 items-center justify-center"
            >
              <X size={14} color="#fff" />
            </Pressable>
            <View className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-primary flex-row items-center">
              <Check size={10} color="#fff" strokeWidth={3} />
              <Text className="ml-1 text-[10px] font-extrabold text-white">UPLOADED</Text>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={onPick}
            className="m-2.5 border-2 border-dashed items-center justify-center bg-surface-muted"
            style={{ borderRadius: 14, minHeight: 128, borderColor: tokens.primaryBright }}
          >
            <View className="h-10 w-10 rounded-full bg-primary items-center justify-center">
              <Upload size={18} color="#fff" />
            </View>
            <Text className="text-[12.5px] font-extrabold text-text mt-2">Tap to upload</Text>
            <Text className="text-[10.5px] text-text-muted mt-0.5">JPG, PNG, WebP · Max 5MB</Text>
          </Pressable>
        )}
      </Card>
    </Animated.View>
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

  // Tablet/iPad: two document cards fit side by side; phones stay one per row
  // (the old fixed-pixel grid math made both narrow, the reported bug).
  const r = useResponsive();
  const numCols = r.isTablet ? 2 : 1;
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 720) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const cardWidthStyle = { width: numCols === 2 ? '50%' : '100%', paddingHorizontal: 6 };

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
      const asset = result.assets[0];
      if (!isSupportedImageAsset(asset)) {
        notify('Unsupported file', 'Please select a JPEG, PNG, or WebP image.');
        return;
      }
      setFiles((prev) => ({ ...prev, [key]: asset }));
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
    // Temporary diagnostic trail (dev-only signal, no tokens/PII): the last
    // "Submit failed" this covered had no server-side trace at all, because
    // Spring doesn't log a successful or cleanly-validated request — only
    // the client saw what happened, and by the time it's reported here the
    // toast has usually vanished. Logging every step below means the NEXT
    // failure is diagnosable from this console alone.
    if (__DEV__) console.log('[KYC] submit start. AUTH_BASE =', AUTH_BASE);
    try {
      // Build the owner KYC blob { aadharFrontUrl, aadharBackUrl, panUrl }.
      const payload = {};
      for (const doc of DOCS) {
        const asset = files[doc.key];
        const field = KEY_TO_URL_FIELD[doc.key];
        if (!asset?.uri) continue;
        if (asset.__fromServer && asset.__serverUrl) {
          if (__DEV__) console.log(`[KYC] ${doc.key}: already hosted, reusing`, asset.__serverUrl);
          payload[field] = asset.__serverUrl;
          continue;
        }
        if (__DEV__) {
          console.log(`[KYC] ${doc.key}: uploading`, {
            uri: asset.uri,
            fileName: asset.fileName || asset.name || null,
            mimeType: asset.mimeType || asset.type || null,
            fileSize: asset.fileSize || asset.size || null,
          });
        }
        // Never persist the device-local file:// URI — the server/admin can't
        // resolve it. If the upload fails, abort the whole submit so
        // the owner isn't told KYC succeeded with an unusable document.
        let hostedUrl;
        try {
          hostedUrl = await uploadMedia(asset, 'owner-kyc');
        } catch (uploadErr) {
          // console.log, not warn/error: RN's LogBox intercepts BOTH of those
          // (a yellow box for warn, red for error) even for an anticipated,
          // already-handled outcome like a bad connection — the catch-all
          // notify() below is the actual user-facing surface for this.
          if (__DEV__) {
            console.log(`[KYC] ${doc.key}: upload threw`, {
              status: uploadErr?.status,
              message: uploadErr?.message,
            });
          }
          throw uploadErr;
        }
        if (__DEV__) console.log(`[KYC] ${doc.key}: upload response ->`, hostedUrl);
        if (!hostedUrl) {
          throw new Error(`Couldn't upload ${doc.title}. Please check your connection and try again.`);
        }
        payload[field] = hostedUrl;
      }

      if (__DEV__) console.log('[KYC] POST /auth/me/kyc-documents payload:', payload);
      let saved;
      try {
        saved = await saveOwnerKycDocuments(payload);
      } catch (saveErr) {
        if (__DEV__) {
          console.log('[KYC] save failed', {
            status: saveErr?.status,
            message: saveErr?.message,
            payload: saveErr?.payload,
          });
        }
        throw saveErr;
      }
      if (__DEV__) console.log('[KYC] save response:', saved);

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
      // console.log, not warn/error — see the comment above; both of those
      // still open LogBox for a failure the toast below already reports.
      if (__DEV__) {
        console.log('[KYC] Submission error:', { status: e?.status, message: e?.message });
      }
      const detail = e?.message || 'Please try again.';
      const status = e?.status ? ` (HTTP ${e.status})` : '';
      notify('Submit failed', `${detail}${status}`, { preset: 'error', haptic: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <AppHeader
        title="KYC Verification"
        subtitle="Submit your business documents"
        onBack={() => navigation.goBack()}
        right={<OwnerBadge />}
      />
      <View style={capStyle}>
        <View className="px-4">
          <StepRail stepState={stepState} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insetBottom + 96 }}>
        <View style={capStyle}>
          <Animated.View entering={FadeIn.duration(280)}>
            <HeroBanner />
          </Animated.View>

          <SectionLabel
            title="Identity Documents"
            subtitle="Upload clear and valid documents. Supported formats: JPG, PNG, WebP (Max 5 MB each)."
          />
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
            {IDENTITY_DOCS.map((doc, i) => (
              <View key={doc.key} style={cardWidthStyle}>
                <DocCard
                  doc={doc}
                  file={files[doc.key]}
                  onPick={() => promptUpload(doc.key)}
                  onRemove={() => remove(doc.key)}
                  index={i}
                />
              </View>
            ))}
          </View>

          <SectionLabel
            title="Tax Document"
            subtitle="Your PAN card is required for tax verification."
          />
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
            {TAX_DOCS.map((doc, i) => (
              <View key={doc.key} style={cardWidthStyle}>
                <DocCard
                  doc={doc}
                  file={files[doc.key]}
                  onPick={() => promptUpload(doc.key)}
                  onRemove={() => remove(doc.key)}
                  index={IDENTITY_DOCS.length + i}
                />
              </View>
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

          <View
            className="flex-row items-center mt-3 rounded-2xl px-3.5 py-3"
            style={{ backgroundColor: tokens.accentSoft, borderWidth: 1, borderColor: tokens.primarySoft }}
          >
            <View
              className="h-8 w-8 rounded-full items-center justify-center mr-2.5"
              style={{ backgroundColor: tokens.primary }}
            >
              <Lock size={14} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-[12px] font-extrabold" style={{ color: tokens.primaryDark }}>
                Your documents are securely encrypted
              </Text>
              <Text className="text-[11px] mt-0.5 leading-4" style={{ color: tokens.textMuted }}>
                We keep your information safe and private.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <BottomActionBar
        title={submitting ? 'Uploading...' : allRequiredDone ? 'Submit Documents' : 'Continue'}
        onPress={onProceed}
        loading={submitting}
        disabled={submitting}
        insetBottom={insetBottom}
      />
    </ScreenContainer>
  );
}
