import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * "I agree to the Terms & Conditions and Privacy Policy" checkbox with links.
 * When `accepted` (this device already agreed to the current versions) it
 * shows the links as a plain notice instead of asking again.
 */
export default function LegalAgreement({ checked, onChange, onOpen, accepted = false, color = '#035C6C', style }) {
  const link = [styles.link, { color }];
  const links = (
    <>
      <Text style={link} onPress={() => onOpen('TERMS')} accessibilityRole="link">Terms & Conditions</Text>
      {' and '}
      <Text style={link} onPress={() => onOpen('PRIVACY')} accessibilityRole="link">Privacy Policy</Text>
    </>
  );

  if (accepted) {
    return (
      <Text style={[styles.text, styles.notice, style]}>
        By continuing, you agree to our {links}.
      </Text>
    );
  }

  return (
    <View style={[styles.row, style]}>
      <Pressable
        onPress={() => onChange(!checked)}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="I agree to the Terms & Conditions and Privacy Policy"
        style={[styles.box, { borderColor: checked ? color : '#B8BCC2' }, checked && { backgroundColor: color }]}
      >
        {checked ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
      </Pressable>
      <Text style={[styles.text, styles.flex]} onPress={() => onChange(!checked)}>
        I agree to the {links}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
    backgroundColor: '#FFFFFF',
  },
  text: { fontSize: 13.5, lineHeight: 20, color: '#4A4F55' },
  notice: { textAlign: 'center' },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
});
