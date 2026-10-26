import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from './cn';
import SafeModal, { ModalInsets } from '../SafeModal';

export function Dialog({ open, onClose, children, className }) {
  return (
    <SafeModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {/* The modal window draws under both system bars: centre inside its own
          safe area, lifted above the keyboard when one is up. */}
      <ModalInsets>
        {({ insets, keyboard }) => (
          <Pressable
            className="flex-1 bg-black/50 justify-center px-6"
            style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, keyboard) }}
            onPress={onClose}
          >
            <Pressable className={cn('bg-card rounded-2xl p-6', className)} style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }} onPress={(e) => e.stopPropagation()}>
              {children}
            </Pressable>
          </Pressable>
        )}
      </ModalInsets>
    </SafeModal>
  );
}

export function DialogHeader({ title, onClose }) {
  return (
    <View className="flex-row items-start justify-between mb-4">
      {title ? <Text className="text-lg font-bold text-text flex-1">{title}</Text> : <View className="flex-1" />}
      {onClose ? (
        <Pressable onPress={onClose} className="p-1">
          <Ionicons name="close" size={22} color="#111111" />
        </Pressable>
      ) : null}
    </View>
  );
}
