import React, { useCallback, useState } from 'react';
import {
  RefreshControl, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ShieldCheck, XCircle, Clock, FileText, CloudUpload,
} from 'lucide-react-native';
import {
  AppHeader, Card, ScreenContainer, StatusChip, Button, Loader,
} from '../../components/rnr';
import { DocumentPreview } from '../../components/owner/kyc/DocumentPreview';
import { OwnerBadge } from '../../components/owner/kyc/OwnerBadge';
import { tokens } from '../../theme/colors';
import { getOwnerKycDocuments } from '../../api/shops';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

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

const STATUS_GRADIENT = {
  APPROVED:       [tokens.accentSoft, tokens.primarySoft],
  REJECTED:       ['#FCA5A5', '#B91C1C'],
  PENDING_REVIEW: [tokens.attentionLight, tokens.attentionDark],
  NONE:           [tokens.textSubtle, tokens.textMuted],
};
const STATUS_TONE = { APPROVED: 'completed', REJECTED: 'cancelled', PENDING_REVIEW: 'pending', PENDING: 'pending' };
const STATUS_LABEL = { APPROVED: 'Approved', REJECTED: 'Rejected', PENDING_REVIEW: 'Pending', PENDING: 'Pending' };

function MetaRow({ label, value }) {
  return (
    <View className="flex-row items-center justify-between px-3.5 py-1">
      <Text className="text-[10.5px] text-text-muted">{label}</Text>
      <Text className="text-[11.5px] font-bold text-text">{value}</Text>
    </View>
  );
}

export default function OwnerKycViewScreen({ route, navigation }) {
  const fromSubmit = !!route?.params?.fromSubmit;
  const [kyc, setKyc] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const r = useResponsive();
  // Single-column always (unlike the upload screen's cards, a full document
  // thumbnail reads worse split across two columns on a tablet) — just
  // capped and centred so it doesn't stretch edge-to-edge.
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 640) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;

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

  const onEdit = () => {
    navigation.navigate('OwnerKycUpload', { existing: kyc });
  };

  const HeroIcon =
    overallStatus === 'APPROVED' ? ShieldCheck
      : overallStatus === 'REJECTED' ? XCircle
        : overallStatus === 'NONE' ? FileText
          : Clock;

  return (
    <ScreenContainer>
      <AppHeader
        title="KYC Documents"
        subtitle="View and manage your documents"
        onBack={() => navigation.goBack()}
        right={<OwnerBadge />}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={tokens.primary}
            colors={[tokens.primary]}
          />
        }
      >
        <View style={capStyle}>
          {/* Status hero card */}
          <View style={{ shadowColor: '#172117', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}>
            <LinearGradient
              colors={STATUS_GRADIENT[overallStatus]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 20, padding: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' }}
            >
              {!isApproved ? (
                <View
                  style={{
                    position: 'absolute', right: -30, top: -30,
                    width: 110, height: 110, borderRadius: 999,
                    backgroundColor: 'rgba(255,255,255,0.10)',
                  }}
                />
              ) : null}
              <View
                style={{
                  width: 48, height: 48, borderRadius: 16,
                  backgroundColor: isApproved ? tokens.primary : 'rgba(255,255,255,0.22)',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: isApproved ? 0 : 1, borderColor: 'rgba(255,255,255,0.30)',
                  marginRight: 12,
                }}
              >
                <HeroIcon size={22} color="#FFFFFF" strokeWidth={2.3} />
              </View>
              <View className="flex-1">
                <Text className="text-[15.5px] font-extrabold" style={{ color: isApproved ? tokens.primary : '#FFFFFF' }}>
                  {overallStatus === 'APPROVED' && 'KYC Approved'}
                  {overallStatus === 'REJECTED' && 'KYC Rejected'}
                  {overallStatus === 'PENDING_REVIEW' && 'Under Review'}
                  {overallStatus === 'NONE' && 'No documents yet'}
                </Text>
                <Text
                  className="text-[11.5px] mt-1 leading-4"
                  style={{ color: isApproved ? tokens.textMuted : 'rgba(255,255,255,0.85)' }}
                >
                  {fromSubmit && overallStatus === 'PENDING_REVIEW'
                    ? 'Thank you! Your documents are being reviewed by admin.'
                    : overallStatus === 'APPROVED' ? 'All documents have been verified. You can continue using all features.'
                      : overallStatus === 'REJECTED' ? 'One or more documents need attention. Tap Edit to fix.'
                        : overallStatus === 'NONE' ? 'Upload your KYC documents to start verification.'
                          : `${orderedDocs.length} document${orderedDocs.length === 1 ? '' : 's'} awaiting admin review.`}
                </Text>
              </View>
              {isApproved ? (
                <View
                  style={{
                    width: 40, height: 40, borderRadius: 13,
                    backgroundColor: tokens.primarySoft,
                    alignItems: 'center', justifyContent: 'center',
                    marginLeft: 8,
                  }}
                >
                  <FileText size={18} color={tokens.primary} strokeWidth={2} />
                </View>
              ) : null}
            </LinearGradient>
          </View>

          {loading ? (
            <Loader label="Loading documents…" className="py-12" />
          ) : orderedDocs.length === 0 ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('OwnerKycUpload')}
              className="mt-4"
              style={{ shadowColor: '#172117', shadowOpacity: 0.10, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 }}
            >
              <LinearGradient
                colors={[tokens.primaryBright, tokens.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <CloudUpload size={16} color="#FFFFFF" />
                <Text className="ml-2 text-white text-[14px] font-extrabold">
                  Upload KYC Documents
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <>
              {/* Section label */}
              <View className="mt-5 mb-2 flex-row items-center">
                <Text className="text-[15px] font-extrabold text-text flex-1">Uploaded Documents</Text>
                <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: tokens.primarySoft }}>
                  <Text className="text-[10.5px] font-extrabold" style={{ color: tokens.primary }}>
                    {isApproved ? `${orderedDocs.length} of ${orderedDocs.length} verified` : `${orderedDocs.length} uploaded`}
                  </Text>
                </View>
              </View>

              {orderedDocs.map((doc, i) => {
                const tone = STATUS_TONE[doc.status] || 'pending';
                const label = STATUS_LABEL[doc.status] || 'Pending';
                return (
                  <Animated.View
                    key={doc.docType}
                    entering={FadeInDown.delay(i * 70).duration(300)}
                    className="mb-3.5"
                  >
                    <Card padded={false} elevated>
                      <View className="flex-row items-center px-3.5 py-3 border-b border-border">
                        <View
                          className="h-8 w-8 rounded-lg items-center justify-center mr-2.5"
                          style={{ backgroundColor: tokens.primarySoft }}
                        >
                          <FileText size={15} color={tokens.primary} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-[14px] font-extrabold text-text" numberOfLines={1}>{doc.title}</Text>
                          <Text className="text-[10.5px] text-text-muted mt-0.5">{GROUP_LABEL[doc.docType]}</Text>
                        </View>
                        <StatusChip tone={tone} label={label} size="sm" />
                      </View>

                      <View className="m-2.5">
                        <DocumentPreview url={doc.url} label={doc.title} height={170} rounded={14} />
                      </View>

                      {doc.submittedAt ? <MetaRow label="Uploaded on" value={fmtDateTime(doc.submittedAt)} /> : null}
                      {doc.reviewedAt ? (
                        <MetaRow
                          label={doc.status === 'APPROVED' ? 'Approved on' : 'Reviewed on'}
                          value={fmtDateTime(doc.reviewedAt)}
                        />
                      ) : null}
                      {(doc.submittedAt || doc.reviewedAt) ? <View className="pb-1" /> : null}

                      {doc.status === 'REJECTED' && doc.rejectReason ? (
                        <View className="mx-3.5 mb-3 px-3 py-2 rounded-xl" style={{ backgroundColor: '#FEE2E2' }}>
                          <Text className="text-[11px] italic leading-4" style={{ color: '#B91C1C' }}>
                            {doc.rejectReason}
                          </Text>
                        </View>
                      ) : null}
                    </Card>
                  </Animated.View>
                );
              })}

              {isApproved ? (
                // Approved: editing is optional maintenance, not urgent — a
                // soft info card replaces the old always-on bright CTA.
                <View
                  className="mt-2 rounded-2xl px-4 py-4"
                  style={{ backgroundColor: tokens.accentSoft, borderWidth: 1, borderColor: tokens.primarySoft }}
                >
                  <Text className="text-[13px] font-extrabold" style={{ color: tokens.primary }}>
                    Need to update your documents?
                  </Text>
                  <Text className="text-[11.5px] mt-1 mb-3 leading-4" style={{ color: tokens.textMuted }}>
                    If your documents have changed or expired, you can upload new ones.
                  </Text>
                  <Button variant="outline" size="sm" onPress={onEdit} className="self-start">
                    Edit Documents
                  </Button>
                </View>
              ) : (
                // Rejected / pending: still an owner-facing action they need
                // to take, so it stays a prominent full-width CTA.
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onEdit}
                  className="mt-2"
                  style={{ shadowColor: '#172117', shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}
                >
                  <LinearGradient
                    colors={[tokens.primaryBright, tokens.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ borderRadius: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text className="text-white text-[14px] font-extrabold">Edit Documents</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
