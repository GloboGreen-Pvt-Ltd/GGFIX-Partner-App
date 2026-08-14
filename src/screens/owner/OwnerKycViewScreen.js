import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  ShieldCheck,
  XCircle,
  Clock,
  FileText,
  Pencil,
  CloudUpload,
  Upload,
  CheckCircle2,
} from 'lucide-react-native';
import { getOwnerKycDocuments } from '../../api/shops';

const BRAND_GREEN      = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.10,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
};

const softShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Owner KYC = personal identity documents only (Aadhar front/back + PAN).
const ORDER = ['aadharFront', 'aadharBack', 'pan'];
const TITLES = {
  aadharFront: 'Aadhar Card Front',
  aadharBack:  'Aadhar Card Back',
  pan:         'PAN Card',
};
const URL_FIELD = { aadharFront: 'aadharFrontUrl', aadharBack: 'aadharBackUrl', pan: 'panUrl' };

function isPdf(url) {
  return typeof url === 'string' && url.toLowerCase().includes('.pdf');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_GRADIENT = {
  APPROVED:       [BRAND_GREEN, BRAND_GREEN_DARK],
  REJECTED:       ['#FCA5A5', '#B91C1C'],
  PENDING_REVIEW: ['#F59E0B', '#B45309'],
  NONE:           ['#8FA08F', '#667066'],
};

export default function OwnerKycViewScreen({ route, navigation }) {
  const fromSubmit = !!route?.params?.fromSubmit;
  const [kyc, setKyc] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Owner KYC is a single blob with one review status shared across all docs.
  const status = kyc.status || 'PENDING_REVIEW';
  const reviewDate = kyc.reviewedAt || kyc.submittedAt;
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
        updatedAt: reviewDate,
      };
    })
    .filter(Boolean);

  const overallStatus = orderedDocs.length === 0 ? 'NONE' : status;

  const onEdit = () => {
    navigation.navigate('OwnerKycUpload', { existing: kyc });
  };

  const HeroIcon =
    overallStatus === 'APPROVED' ? ShieldCheck
      : overallStatus === 'REJECTED' ? XCircle
        : overallStatus === 'NONE' ? FileText
          : Clock;

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F8EF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: 6,
            paddingBottom: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-muted"
            >
              <ChevronLeft size={22} color="#172117" />
            </TouchableOpacity>
            <Text className="flex-1 text-text text-[17px] font-extrabold" numberOfLines={1}>
              KYC Documents
            </Text>
            {orderedDocs.length > 0 ? (
              <Pressable
                onPress={onEdit}
                className="px-2.5 py-1 rounded-full flex-row items-center bg-surface-muted"
                hitSlop={6}
              >
                <Pencil size={11} color="#172117" />
                <Text className="ml-1 text-text text-[10.5px] font-extrabold">EDIT</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {(
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={BRAND_GREEN_DARK}
              colors={[BRAND_GREEN_DARK]}
            />
          }
        >
          {/* Status hero card */}
          <View style={cardShadow}>
            <LinearGradient
              colors={STATUS_GRADIENT[overallStatus]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 22, padding: 16, overflow: 'hidden' }}
            >
              <View
                style={{
                  position: 'absolute', right: -30, top: -30,
                  width: 110, height: 110, borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.10)',
                }}
              />
              <View className="flex-row items-center">
                <View
                  style={{
                    width: 48, height: 48, borderRadius: 16,
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
                    marginRight: 12,
                  }}
                >
                  <HeroIcon size={22} color="#FFFFFF" strokeWidth={2.3} />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-[15.5px] font-extrabold">
                    {overallStatus === 'APPROVED' && 'KYC Approved'}
                    {overallStatus === 'REJECTED' && 'KYC Rejected'}
                    {overallStatus === 'PENDING_REVIEW' && 'Under Review'}
                    {overallStatus === 'NONE' && 'No documents yet'}
                  </Text>
                  <Text className="text-white/85 text-[11.5px] mt-1 leading-4">
                    {fromSubmit && overallStatus === 'PENDING_REVIEW'
                      ? 'Thank you! Your documents are being reviewed by admin.'
                      : overallStatus === 'APPROVED' ? 'All documents have been verified.'
                        : overallStatus === 'REJECTED' ? 'One or more documents need attention. Tap Edit to fix.'
                          : overallStatus === 'NONE' ? 'Upload your KYC documents to start verification.'
                            : `${orderedDocs.length} document${orderedDocs.length === 1 ? '' : 's'} awaiting admin review.`}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {loading ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="large" color={BRAND_GREEN_DARK} />
            </View>
          ) : orderedDocs.length === 0 ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate('OwnerKycUpload')}
              className="mt-4"
              style={cardShadow}
            >
              <LinearGradient
                colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 18,
                  paddingVertical: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
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
              <View className="mt-5 mb-2 ml-1 flex-row items-center">
                <Text
                  className="text-[11px] font-extrabold uppercase flex-1"
                  style={{ color: BRAND_GREEN_DARK, letterSpacing: 1.2 }}
                >
                  Uploaded Documents
                </Text>
                <View
                  className="px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Text
                    className="text-[10.5px] font-extrabold"
                    style={{ color: BRAND_GREEN_DARK }}
                  >
                    {orderedDocs.length} uploaded
                  </Text>
                </View>
              </View>

              {/* Doc grid */}
              <View className="flex-row flex-wrap -mx-1">
                {orderedDocs.map((doc) => {
                  const status = doc.status || 'PENDING';
                  const pillMeta =
                    status === 'APPROVED' ? { tint: '#E6F7E3', accent: BRAND_GREEN_DARK, Icon: CheckCircle2 }
                      : status === 'REJECTED' ? { tint: '#FEE2E2', accent: '#B91C1C', Icon: XCircle }
                        : { tint: '#FEF3C7', accent: '#B45309', Icon: Clock };
                  const PillIcon = pillMeta.Icon;
                  return (
                    <View key={doc.id || doc.docType} style={{ width: '50%', padding: 6 }}>
                      <View className="bg-white rounded-2xl p-3" style={softShadow}>
                        <View
                          className="flex-row items-center rounded-xl px-2 py-1.5 mb-2"
                          style={{ backgroundColor: '#F7FAF7' }}
                        >
                          <FileText size={12} color="#667066" />
                          <Text
                            className="flex-1 text-[11px] font-extrabold text-gray-800 ml-1.5"
                            numberOfLines={1}
                          >
                            {doc.title || TITLES[doc.docType] || doc.docType}
                          </Text>
                          {doc.required ? (
                            <Text className="text-[12px] font-extrabold" style={{ color: '#DC2626' }}>*</Text>
                          ) : null}
                        </View>

                        <View
                          className="rounded-xl overflow-hidden items-center justify-center"
                          style={{
                            backgroundColor: '#F0F8EF',
                            minHeight: 112,
                            borderWidth: 1, borderColor: '#E6F7E3',
                          }}
                        >
                          {isPdf(doc.url) ? (
                            <View className="flex-row items-center px-2.5 py-2 w-full">
                              <View
                                className="px-2 py-1 rounded mr-2"
                                style={{ backgroundColor: '#DC2626' }}
                              >
                                <Text className="text-white text-[10px] font-extrabold">PDF</Text>
                              </View>
                              <Text className="flex-1 text-[11px] font-semibold text-gray-700" numberOfLines={2}>
                                {(doc.title || doc.docType).toLowerCase().replace(/\s+/g, '-')}.pdf
                              </Text>
                            </View>
                          ) : (
                            <Image
                              source={{ uri: doc.url }}
                              style={{ width: '100%', height: 112 }}
                              resizeMode="cover"
                            />
                          )}
                        </View>

                        <View className="flex-row items-center mt-2">
                          <View
                            className="flex-row items-center px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: pillMeta.tint }}
                          >
                            <PillIcon size={9} color={pillMeta.accent} />
                            <Text
                              className="ml-1 text-[9.5px] font-extrabold"
                              style={{ color: pillMeta.accent, letterSpacing: 0.3 }}
                            >
                              {status}
                            </Text>
                          </View>
                          <Text
                            className="flex-1 ml-1 text-[9.5px] font-bold text-gray-400"
                            numberOfLines={1}
                          >
                            {fmtDate(doc.updatedAt || doc.createdAt)}
                          </Text>
                        </View>

                        {status === 'REJECTED' && doc.rejectReason ? (
                          <Text
                            className="text-[10px] mt-2 italic leading-3"
                            style={{ color: '#B91C1C' }}
                          >
                            {doc.rejectReason}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* CTA */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onEdit}
                className="mt-4"
                style={cardShadow}
              >
                <LinearGradient
                  colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 18,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Upload size={16} color="#FFFFFF" />
                  <Text className="ml-2 text-white text-[14px] font-extrabold">
                    Edit Documents
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
