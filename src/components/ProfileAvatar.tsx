import React, { useEffect, useState } from 'react';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ExpoImage, type ImageErrorEventData } from 'expo-image';
import { normalizeImageUrl } from '../utils/images';
import { shopInitial } from './dashboard/theme';

// TEMPORARY DEBUG — set to false (or delete this block + its two call sites
// below) once the two devices' logs have been compared and the cause is
// confirmed. Left on by default here at the caller's explicit request.
const DEBUG_AVATAR_LOADING = true;

export interface ProfileAvatarProps {
  imageUrl?: string | null;
  name?: string | null;
  size: number;
  backgroundColor?: string;
  textColor?: string;
  borderWidth?: number;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Circular avatar with normalized-URL loading and an explicit error
 * fallback, rendering identically across Android OEM devices.
 *
 * Uses expo-image (Glide on Android) instead of RN's built-in <Image> for
 * the same reason `DeviceImage.js` already does for catalog photos: some
 * Android OEM image decoders fail on formats RN's default Image can't
 * handle (HEIC/HEIF straight off a phone camera is common — several
 * Android camera apps default to it), and RN's Image gives no error
 * callback to recover from, so a failed decode silently renders nothing —
 * just this circle's plain background color, which is exactly the "only
 * the fallback green circle" symptom. `onError` here lets a genuine
 * failure fall back to initials instead of an unexplained blank circle.
 */
export function ProfileAvatar({
  imageUrl,
  name,
  size,
  backgroundColor = '#00796B',
  textColor = '#FFFFFF',
  borderWidth,
  borderColor,
  style,
}: ProfileAvatarProps) {
  const normalizedUrl = normalizeImageUrl(imageUrl ?? null);
  const [failed, setFailed] = useState(false);

  // Re-arm on a genuinely new URL (switching shops, avatar re-upload) — a
  // stale `failed=true` from a previous image must not stick to a new one.
  useEffect(() => {
    setFailed(false);
  }, [normalizedUrl]);

  // TEMPORARY DEBUG — compare this exact log between the two affected
  // devices. If `rawImageUrl` differs between them, it's a data/session
  // problem upstream (see the fix in DashboardScreen.tsx's reloadSession and
  // src/api/auth.js's fetchMe). If it's identical but `normalizedUrl` fails
  // to load (watch for the onError warning below), it's a genuine
  // network/decode/SSL issue on that device.
  useEffect(() => {
    if (!DEBUG_AVATAR_LOADING) return;
    console.log('[ProfileAvatar debug]', {
      rawImageUrl: imageUrl,
      normalizedUrl,
      platform: Platform.OS,
      uriType: typeof normalizedUrl,
    });
    if (!normalizedUrl) return;
    ExpoImage.prefetch(normalizedUrl)
      .then((ok) => console.log('[ProfileAvatar debug] prefetch result:', ok, normalizedUrl))
      .catch((err) => console.error('[ProfileAvatar debug] prefetch FAILED:', normalizedUrl, err));
  }, [imageUrl, normalizedUrl]);

  const showImage = !!normalizedUrl && !failed;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth,
          borderColor,
        },
        style,
      ]}
    >
      {showImage ? (
        <ExpoImage
          source={normalizedUrl}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="disk"
          transition={150}
          onError={({ error }: ImageErrorEventData) => {
            console.warn('ProfileAvatar: image load failed', normalizedUrl, error);
            setFailed(true);
          }}
        />
      ) : (
        <Text style={{ color: textColor, fontWeight: '700', fontSize: size * 0.36 }}>{shopInitial(name)}</Text>
      )}
    </View>
  );
}
