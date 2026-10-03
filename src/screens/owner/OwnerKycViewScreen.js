import React, { useCallback, useState } from 'react';
import {
  Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ShieldCheck, XCircle, Clock, FileText, CloudUpload, CheckCircle2, Maximize2, PencilLine,
} from 'lucide-react-native';
import {
  AppHeader, ScreenContainer, Loader,
} from '../../components/rnr';
import { DocumentPreview } from '../../components/owner/kyc/DocumentPreview';
import { OwnerBadge } from '../../components/owner/kyc/OwnerBadge';
import ImageViewerModal from '../../components/ImageViewerModal';
import { getOwnerKycDocuments } from '../../api/shops';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — green #09AD2A, red #F84141, yellow #F3BF23, ink #1E1E1E,
// neutrals #F8F8F8 / #F3F3F3.
const C = {
  green: '#09AD2A',
  greenDark: '#078F23',
  mint: '#EAF8EC',
  red: '#F84141',
  redTint: '#FEECEC',
  yellow: '#F3BF23',
  yellowInk: '#8A6A00',
  yellowTint: '#FFF8E1',
  ink: '#1E1E1E',
  muted: '#6B6B6B',
  line: '#E6E6E6',
  soft: '#F3F3F3',
  page: '#F8F8F8',
  card: '#FFFFFF',
};

// Owner KYC = a single blob with ONE review status shared across all docs
// (see api/shops.js) — Aadhar front/back + PAN.
const ORDER = ['aadharFront', 'aadharBack', 'pan'];
const TITLES = {
  aadharFront: 'Aadhaar Card (Front)',
  aadharBack:  'Aadhaar Card (Back)',
  pan:         'PAN Card',
};
const URL_FIELD = { aadharFront: 'aadharFrontUrl', aadharBack: 'aadharBackUrl', pan: 'panUrl' };
// Same identity/tax grouping OwnerKycUploadScreen uses — not fabricated,
// mirrors the doc's real purpose.
const GROUP_LABEL = { aadharFront: 'Identity Proof', aadharBack: 'Identity Proof', pan: 'Tax Proof' };

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

const isPdf = (url) => typeof url === 'string' && url.toLowerCase().split('?')[0].endsWith('.pdf');

// Status look: tinted hero + matching pill per review state.
const STATUS_UI = {
  APPROVED:       { label: 'Approved', icon: ShieldCheck, fg: C.green, ink: C.greenDark, tint: C.mint, title: 'KYC Approved' },
  REJECTED:       { label: 'Rejected', icon: XCircle, fg: C.red, ink: C.red, tint: C.redTint, title: 'KYC Rejected' },
  PENDING_REVIEW: { label: 'Pending', icon: Clock, fg: C.yellow, ink: C.yellowInk, tint: C.yellowTint, title: 'Under Review' },
  PENDING:        { label: 'Pending', icon: Clock, fg: C.yellow, ink: C.yellowInk, tint: C.yellowTint, title: 'Under Review' },
  NONE:           { label: 'Not uploaded', icon: FileText, fg: C.muted, ink: C.ink, tint: C.soft, title: 'No documents yet' },
};

function StatusPill({ status }) {
  const ui = STATUS_UI[status] || STATUS_UI.PENDING_REVIEW;
  const Icon = status === 'APPROVED' ? CheckCircle2 : ui.icon;
  return (
    <View className="flex-row items-center rounded-full" style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: ui.tint }}>
      <Icon size={11} color={ui.ink} strokeWidth={2.4} />
      <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 10.5, color: ui.ink }}>{ui.label}</Text>
    </View>
  );
}

// Stacked (label above value) — the grid cards are a third of the screen wide.
function MetaRow({ label, value }) {
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={{ fontSize: 10, color: C.muted }}>{label}</Text>
      <Text className="font-bold" style={{ fontSize: 10, lineHeight: 13, color: C.ink, marginTop: 1 }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function PrimaryButton({ label, Icon, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      style={{ minHeight: 48, borderRadius: 999, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}
    >
      {Icon ? <Icon size={16} color="#FFFFFF" /> : null}
      <Text className="font-extrabold" style={{ marginLeft: Icon ? 8 : 0, fontSize: 13, color: '#FFFFFF' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function OwnerKycViewScreen({ route, navigation }) {
  const fromSubmit = !!route?.params?.fromSubmit;
  const [kyc, setKyc] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewer, setViewer] = useState(null); // index into the image list

  const r = useResponsive();
  // All three documents sit side by side in one row (3-column grid), inside
  // a centred, capped column on tablets.
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 960) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const GRID_GAP = 8;
  const gridInner = contentW || r.width - 28; // ScrollView padding is 14 a side
  const cardW = Math.floor((gridInner - GRID_GAP * 2) / 3);
  // Preview keeps a document-ish 4:3 box that grows with the card.
  const previewH = Math.max(84, Math.min(180, Math.round(cardW * 0.78)));

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await getOwnerKycDocuments();
      setKyc(res && typeof res === 'object' ? res : {});
    } catch {
      setKyc({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const status = kyc.status || 'PENDING_REVIEW';
  const orderedDocs = ORDER
    .map((key) => {
      const url = kyc[URL_FIELD[key]];
      if (!url) return null;
      return {
        docType: key,
        title: TITLES[key],
        url,
        required: true,
        status,
        rejectReason: status === 'REJECTED' ? kyc.rejectReason : null,
        submittedAt: kyc.submittedAt || null,
        reviewedAt: kyc.reviewedAt || null,
      };
    })
    .filter(Boolean);

  const overallStatus = orderedDocs.length === 0 ? 'NONE' : status;
  const isApproved = overallStatus === 'APPROVED';
  const hero = STATUS_UI[overallStatus] || STATUS_UI.PENDING_REVIEW;
  const HeroIcon = hero.icon;

  // Images open in the zoomable full-screen viewer (swipe between them);
  // a PDF opens in the system viewer.
  const images = orderedDocs.filter((d) => !isPdf(d.url)).map((d) => ({ uri: d.url, label: d.title }));
  const openDoc = (doc) => {
    if (isPdf(doc.url)) { Linking.openURL(doc.url).catch(() => {}); return; }
    const idx = images.findIndex((im) => im.uri === doc.url);
    setViewer(idx < 0 ? 0 : idx);
  };

  const onEdit = () => {
    navigation.navigate('OwnerKycUpload', { existing: kyc });
  };

  const heroMessage = fromSubmit && overallStatus === 'PENDING_REVIEW'
    ? 'Thank you! Your documents are being reviewed by admin.'
    : overallStatus === 'APPROVED' ? 'All documents have been verified. You can continue using all features.'
      : overallStatus === 'REJECTED' ? 'One or more documents need attention. Tap Edit to fix.'
        : overallStatus === 'NONE' ? 'Upload your KYC documents to start verification.'
          : `${orderedDocs.length} document${orderedDocs.length === 1 ? '' : 's'} awaiting admin review.`;

  return (
    <ScreenContainer>
      <AppHeader
        title="KYC Documents"
        subtitle="View and manage your documents"
        onBack={() => navigation.goBack()}
        right={<OwnerBadge />}
      />

      <ScrollView
        style={{ backgroundColor: C.page }}
        contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />
        }
      >
        <View style={capStyle}>
          {/* Status hero */}
          <View
            className="flex-row items-center"
            style={{ borderRadius: 18, padding: 14, backgroundColor: hero.tint, borderWidth: 1, borderColor: C.card }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: hero.fg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <HeroIcon size={21} color="#FFFFFF" strokeWidth={2.3} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-extrabold" style={{ fontSize: 15, color: hero.ink }}>{hero.title}</Text>
              <Text style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 17 }}>{heroMessage}</Text>
            </View>
          </View>

          {loading ? (
            <Loader label="Loading documents…" className="py-12" />
          ) : orderedDocs.length === 0 ? (
            <View style={{ marginTop: 14 }}>
              <PrimaryButton label="Upload KYC Documents" Icon={CloudUpload} onPress={() => navigation.navigate('OwnerKycUpload')} />
            </View>
          ) : (
            <>
              {/* Section label */}
              <View className="flex-row items-center" style={{ marginTop: 16, marginBottom: 8 }}>
                <Text className="font-extrabold" style={{ flex: 1, fontSize: 13, color: C.ink }}>Uploaded Documents</Text>
                <View className="rounded-full" style={{ paddingHorizontal: 9, paddingVertical: 3, backgroundColor: isApproved ? C.mint : C.soft }}>
                  <Text className="font-extrabold" style={{ fontSize: 10.5, color: isApproved ? C.greenDark : C.ink }}>
                    {isApproved ? `${orderedDocs.length} of ${orderedDocs.length} verified` : `${orderedDocs.length} uploaded`}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginBottom: 8 }}>
                {orderedDocs.map((doc, i) => (
                  <Animated.View
                    key={doc.docType}
                    entering={FadeInDown.delay(i * 70).duration(300)}
                    style={{ width: cardW }}
                  >
                    <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.soft, overflow: 'hidden', padding: 7 }}>
                      {/* Whole document (not cropped); tap to open full screen. */}
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => openDoc(doc)}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={`View ${doc.title}`}
                      >
                        <DocumentPreview url={doc.url} label={doc.title} height={previewH} rounded={10} fit="contain" />
                        <View style={{ position: 'absolute', right: 5, bottom: 5, height: 22, width: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,30,30,0.7)' }}>
                          <Maximize2 size={11} color="#FFFFFF" />
                        </View>
                      </TouchableOpacity>

                      <Text className="font-extrabold" style={{ marginTop: 7, fontSize: 12, lineHeight: 15, color: C.ink }} numberOfLines={2}>
                        {doc.title}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.muted, marginTop: 1 }} numberOfLines={1}>{GROUP_LABEL[doc.docType]}</Text>
                      <View style={{ marginTop: 6, alignItems: 'flex-start' }}>
                        <StatusPill status={doc.status} />
                      </View>

                      {doc.submittedAt ? <MetaRow label="Uploaded" value={fmtDateTime(doc.submittedAt)} /> : null}
                      {doc.reviewedAt ? (
                        <MetaRow label={doc.status === 'APPROVED' ? 'Approved' : 'Reviewed'} value={fmtDateTime(doc.reviewedAt)} />
                      ) : null}

                      {doc.status === 'REJECTED' && doc.rejectReason ? (
                        <View style={{ marginTop: 6, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 8, backgroundColor: C.redTint }}>
                          <Text className="italic" style={{ fontSize: 10, color: C.red, lineHeight: 14 }} numberOfLines={4}>{doc.rejectReason}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Animated.View>
                ))}
              </View>

              {isApproved ? (
                // Approved: editing is optional maintenance, not urgent — a
                // soft info panel instead of a bright full-width CTA.
                <View className="flex-row items-center" style={{ marginTop: 8, borderRadius: 16, padding: 14, backgroundColor: C.mint }}>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                    <Text className="font-extrabold" style={{ fontSize: 13, color: C.greenDark }}>Need to update your documents?</Text>
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 16 }}>
                      If your documents have changed or expired, you can upload new ones.
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={onEdit}
                    accessibilityRole="button"
                    className="flex-row items-center rounded-full"
                    style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.green }}
                  >
                    <PencilLine size={13} color={C.greenDark} />
                    <Text className="font-extrabold" style={{ marginLeft: 5, fontSize: 12, color: C.greenDark }}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                // Rejected / pending: an action the owner needs to take, so it
                // stays a prominent full-width CTA.
                <View style={{ marginTop: 8 }}>
                  <PrimaryButton label="Edit Documents" Icon={PencilLine} onPress={onEdit} />
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ImageViewerModal visible={viewer != null} images={images} index={viewer || 0} onClose={() => setViewer(null)} />
    </ScreenContainer>
  );
}
