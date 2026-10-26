import React from 'react';
import { View, Text } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';

// Both KYC screens live under the owner-only stack, so this is always true —
// no session/role fetch needed, just the same visual chip MyAccountScreen
// uses for its own OWNER/SHOP pill.
export function OwnerBadge() {
  return (
    <View
      className="flex-row items-center px-2.5 py-1 rounded-full"
      style={{ backgroundColor: '#E5F3F5' }}
    >
      <ShieldCheck size={11} color="#035C6C" strokeWidth={2.2} />
      <Text
        className="ml-1 text-[10px] font-extrabold"
        style={{ color: '#035C6C', letterSpacing: 0.5 }}
      >
        OWNER
      </Text>
    </View>
  );
}
