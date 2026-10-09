import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { AlertCircle } from 'lucide-react-native';
import { tokens } from '../../../theme/colors';

function isPdfUrl(url) {
  return typeof url === 'string' && url.toLowerCase().split('?')[0].endsWith('.pdf');
}

/**
 * Read-only preview for one KYC document — image, PDF, or (when the image
 * fails to load) an explicit "Document unavailable" state. Shared by the
 * upload screen's uploaded-state preview and the approved documents view, so
 * both ever show ONE broken-image treatment instead of a silent grey box.
 */
// `fit`: 'cover' fills the box (upload screen thumbnails); 'contain' shows the
// whole document (the documents view, where cropping hid most of the card).
export function DocumentPreview({ url, label, height = 150, rounded = 14, fit = 'cover' }) {
  const [failed, setFailed] = useState(false);

  if (!url) return null;

  if (isPdfUrl(url)) {
    return (
      <View
        className="flex-row items-center px-3"
        style={{ height, borderRadius: rounded, backgroundColor: tokens.surfaceMuted }}
      >
        <View className="px-2 py-1 rounded" style={{ backgroundColor: tokens.danger }}>
          <Text className="text-white text-[10px] font-extrabold">PDF</Text>
        </View>
        <Text className="ml-2.5 flex-1 text-[12px] font-semibold text-text" numberOfLines={2}>
          {(label || 'document').toLowerCase().replace(/\s+/g, '-')}.pdf
        </Text>
      </View>
    );
  }

  if (failed) {
    return (
      <View
        className="items-center justify-center px-3"
        style={{ height, borderRadius: rounded, backgroundColor: tokens.surfaceMuted }}
      >
        <AlertCircle size={20} color={tokens.textSubtle} />
        <Text className="mt-1.5 text-[11px] font-semibold text-text-muted">Document unavailable</Text>
      </View>
    );
  }

  return (
    <ExpoImage
      source={{ uri: url }}
      style={{ width: '100%', height, borderRadius: rounded, backgroundColor: tokens.surfaceMuted }}
      contentFit={fit}
      transition={150}
      onError={() => setFailed(true)}
    />
  );
}
