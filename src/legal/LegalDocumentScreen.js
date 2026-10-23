import React from 'react';
import { StyleSheet, View } from 'react-native';
import PageHeader from '../components/PageHeader';
import LegalDocumentView from './LegalDocumentView';
import { LEGAL_DOCS, LEGAL_DOC_TYPES } from './legalContent';

const ROUTES = {
  [LEGAL_DOC_TYPES.TERMS]: 'Terms',
  [LEGAL_DOC_TYPES.PRIVACY]: 'PrivacyPolicy',
};

/** Registered as "Terms" / "PrivacyPolicy" (route param `type`) in both the auth and app stacks. */
export default function LegalDocumentScreen({ navigation, route }) {
  const doc = LEGAL_DOCS[route?.params?.type] || LEGAL_DOCS[LEGAL_DOC_TYPES.TERMS];
  return (
    <View style={styles.fill}>
      <PageHeader title={doc.screenTitle} onBack={() => navigation.goBack()} />
      {/* replace, not push: hopping between the two policies never stacks up screens. */}
      <LegalDocumentView doc={doc} onOpenDoc={(type) => navigation.replace(ROUTES[type])} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#FFFFFF' },
});
