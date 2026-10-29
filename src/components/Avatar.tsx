import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { cookieHeader } from '../api/cookies';
import { HTTP_ORIGIN } from '../config';
import { colors, fonts } from '../theme';
import { resolveUrl } from '../utils';

interface Props {
  uri?: string | null;
  name: string;
  size?: number;
  radius?: number;
  /** Server-icon style: transparent letter fallback (the container supplies the tile background). */
  tile?: boolean;
}

// Figma avatar placeholder: grey disc with a light head-and-shoulders silhouette.
// Proportions come from the 'Placeholder head' / 'Placeholder shoulders' nodes (96px portrait).
function Silhouette({ size, radius }: { size: number; radius: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.avatarBg, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.364,
          top: size * 0.223,
          width: size * 0.282,
          height: size * 0.282,
          borderRadius: size,
          backgroundColor: colors.avatarFg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.22,
          top: size * 0.536,
          width: size * 0.566,
          height: size * 0.293,
          borderRadius: size,
          backgroundColor: colors.avatarFg,
        }}
      />
    </View>
  );
}

// Load order: 1) plain request (images are normally public, and iOS can mishandle a manual Cookie
// header on image requests), 2) same-origin only: retry with the session cookie in case the media
// is authenticated, 3) placeholder.
export function Avatar({ uri, name, size = 40, radius, tile }: Props) {
  const url = resolveUrl(uri);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [url]);
  const r = radius ?? size / 2;

  if (url && attempt < 2) {
    const headers = attempt === 1 ? { Cookie: cookieHeader() } : undefined;
    return (
      <Image
        key={`${url}:${attempt}`}
        source={{ uri: url, headers }}
        resizeMode="cover"
        style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.avatarBg }}
        onError={(e) => {
          if (__DEV__) console.warn('Avatar failed to load', url, e.nativeEvent?.error);
          setAttempt((a) => (a === 0 && url.startsWith(HTTP_ORIGIN) ? 1 : 2));
        }}
      />
    );
  }
  if (tile) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text, fontFamily: fonts.satoshiBold, fontSize: size * 0.42 }}>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
    );
  }
  return <Silhouette size={size} radius={r} />;
}
