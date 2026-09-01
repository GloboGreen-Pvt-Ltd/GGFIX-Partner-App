import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function OwnerKycPendingScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Ionicons name="time-outline" size={72} color="#16BB05" />
        <Text style={styles.title}>We’re evaluating your profile</Text>
        <Text style={styles.desc}>
          Thank you for submitting your documents. It is currently under admin verification and
          awaiting approval.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('OwnerTabs')}
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
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 18, fontWeight: '700', color: '#172117', marginTop: 16, textAlign: 'center' },
  desc: { fontSize: 13, color: '#667066', marginTop: 8, textAlign: 'center' },
  button: {
    marginTop: 24,
    backgroundColor: '#172117',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});

