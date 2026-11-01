import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function OwnerKycPendingScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Ionicons name="time-outline" size={56} color="#035C6C" />
        <Text style={styles.title}>We’re evaluating your profile</Text>
        <Text style={styles.desc}>
          Thank you for submitting your documents. It is currently under admin verification and
          awaiting approval.
        </Text>

        <TouchableOpacity
          style={styles.button}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() => navigation.popTo('OwnerTabs')}
        >
          <Ionicons name="arrow-back-outline" size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  title: { fontSize: 17, fontWeight: '700', color: '#111111', marginTop: 12, textAlign: 'center' },
  desc: { fontSize: 13, color: '#6B7280', marginTop: 6, textAlign: 'center', maxWidth: 480 },
  button: {
    marginTop: 18,
    backgroundColor: '#111111',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: { marginLeft: 6, fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
});

