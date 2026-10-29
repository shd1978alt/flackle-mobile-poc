import React from 'react';
import { View } from 'react-native';
import { colors, dp } from '../theme';
import { PresenceStatus } from '../types';
import { Avatar } from './Avatar';

interface DotProps {
  status: PresenceStatus;
  width: number;
  height?: number;
  /** Colour of the 10px ring around the dot (the surface behind it). */
  ring: string;
}

// 'presence-online' / 'presence-dnd' / 'presence-invisible': a filled disc with a 10px inside stroke;
// do-not-disturb and invisible carry a 17.4 x 3.7px bar in a darker shade.
export function PresenceDot({ status, width, height, ring }: DotProps) {
  const fill = status === 'online' ? colors.presenceOnline : status === 'dnd' ? colors.presenceDnd : colors.presenceOff;
  const bar = status === 'dnd' ? colors.presenceDndBar : status === 'invisible' ? colors.presenceOffBar : null;
  return (
    <View
      style={{
        width,
        height: height ?? width,
        borderRadius: Math.max(width, height ?? width),
        backgroundColor: fill,
        borderWidth: dp(10),
        borderColor: ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {bar && <View style={{ width: dp(17.4), height: dp(3.7), borderRadius: dp(2.49), backgroundColor: bar }} />}
    </View>
  );
}

interface AvatarProps {
  uri?: string | null;
  name: string;
  size: number;
  status?: PresenceStatus;
  /** Dot box and its offset from the avatar's top-left, all in points. */
  dot: { w: number; h: number; x: number; y: number };
  ring: string;
}

export function PresenceAvatar({ uri, name, size, status, dot, ring }: AvatarProps) {
  return (
    <View style={{ width: size, height: size }}>
      <Avatar uri={uri} name={name} size={size} />
      {status && (
        <View style={{ position: 'absolute', left: dot.x, top: dot.y }}>
          <PresenceDot status={status} width={dot.w} height={dot.h} ring={ring} />
        </View>
      )}
    </View>
  );
}

// Geometry measured from the design.
// Conversation list rows (96px avatar): dot 51 x 52 at (51.8, 52.4).
export const LIST_DOT = { w: dp(51), h: dp(52), x: dp(51.8), y: dp(52.4) };
// Conversation header and drawer message card (112px avatar): dot 57 x 57 at (63, 63).
export const LARGE_DOT = { w: dp(57), h: dp(57), x: dp(63), y: dp(63) };
