import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { saveOwnerKycDocuments } from '../../api/shops';
import { notify } from '../../components/confirm';

const ORDER = ['aadharFront', 'aadharBack', 'pan'];
const KEY_TO_URL_FIELD = { aadharFront: 'aadharFrontUrl', aadharBack: 'aadharBackUrl', pan: 'panUrl' };

function isPdf(url) {
  return typeof url === 'string' && url.toLowerCase().includes('.pdf');
}

export default function OwnerKycReviewScreen({ route, navigation }) {
  const uploaded = route?.params?.uploaded || {};
  const [submitting, setSubmitting] = useState(false);

  // Build a stable list of cards to render — only the documents the user actually
  // uploaded show up here, in the canonical order. Optional docs (GST / Udyam)
  // appear automatically when they're present.
  const docs = useMemo(() => {
    return ORDER
      .map((key) => {
        const entry = uploaded[key];
        if (!entry) return null;
        return { key, ...entry };
      })
      .filter(Boolean);
  }, [uploaded]);

  const doneCount = docs.length;

  const onSubmit = async () => {
    if (docs.length === 0) {
      notify('No documents', 'There are no uploaded documents to submit.');
      return;
    }
    setSubmitting(true);
    try {
      // The upload screen already pushed files to /media/upload, so url here is
      // the hosted URL. Persist the owner KYC blob to users.kyc_document.
      const payload = {};
      for (const d of docs) {
        const field = KEY_TO_URL_FIELD[d.key];
        if (field && d.url) payload[field] = d.url;
      }
      await saveOwnerKycDocuments(payload);
      navigation.replace('OwnerKycView', { fromSubmit: true });
    } catch (e) {
      notify('Submit failed', e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Status header */}
        <View style={styles.statusCard}>
          <View style={styles.statusIconWrap}>
            <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Documents uploaded</Text>
            <Text style={styles.statusSub}>
              {doneCount} {doneCount === 1 ? 'document' : 'documents'} ready for review.
              Confirm and submit for verification.
            </Text>
          </View>
        </View>

        {/* Document tiles */}
        {docs.length === 0 ? (
          <Text style={styles.empty}>No documents uploaded. Go back and upload your KYC documents.</Text>
        ) : (
          <View style={styles.grid}>
            {docs.map((doc) => (
              <View key={doc.key} style={styles.cardOuter}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderIcon}>
                    <Ionicons name="person-circle-outline" size={16} color="#172117" />
                  </View>
                  <Text style={styles.cardHeaderTitle} numberOfLines={1}>{doc.title}</Text>
                  {doc.required && <Text style={styles.requiredStar}>*</Text>}
                </View>
                <View style={styles.preview}>
                  {isPdf(doc.url) ? (
                    <View style={styles.pdfTile}>
                      <View style={styles.pdfBadge}><Text style={styles.pdfBadgeText}>PDF</Text></View>
                      <Text style={styles.pdfName} numberOfLines={2}>
                        {doc.title.toLowerCase().replace(/\s+/g, '-')}.pdf
                      </Text>
                    </View>
                  ) : (
                    <Image source={{ uri: doc.url }} style={styles.previewImg} />
                  )}
                  <View style={styles.previewCheck}>
                    <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSubmit]}
          onPress={onSubmit}
          disabled={submitting || docs.length === 0}
          activeOpacity={0.9}
        >
          {submitting ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.actionBtnText}>SUBMITTING…</Text>
            </>
          ) : (
            <>
              <Text style={styles.actionBtnText}>SUBMIT</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={14} color="#16BB05" />
          <Text style={styles.editBtnText}>Edit documents</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 32 },

  statusCard: {
    flexDirection: 'row',
    backgroundColor: '#16BB05',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  statusIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  statusSub: { fontSize: 11, color: 'rgba(255,255,255,0.92)', marginTop: 2, lineHeight: 15 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardOuter: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF5EE',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  cardHeaderIcon: { width: 18, alignItems: 'center' },
  cardHeaderTitle: { flex: 1, fontSize: 11, fontWeight: '700', color: '#172117' },
  requiredStar: { color: '#DC2626', fontWeight: '800', fontSize: 12 },

  preview: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#16BB05',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 110,
  },
  previewImg: { width: '100%', height: 110, resizeMode: 'cover' },
  previewCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#16BB05',
    alignItems: 'center',
    justifyContent: 'center',
  },

  pdfTile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
    minHeight: 110,
  },
  pdfBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  pdfBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  pdfName: { flex: 1, fontSize: 11, color: '#172117', fontWeight: '600' },

  empty: { fontSize: 12, color: '#667066', textAlign: 'center', paddingVertical: 20 },

  actionBtn: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnSubmit: { backgroundColor: '#087A0A' },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },

  editBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  editBtnText: { color: '#16BB05', fontSize: 12, fontWeight: '700' },
});
