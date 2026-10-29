import React from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { ICONS, IconName } from './paths';

interface Props {
  name: IconName;
  /** Size in points. Give width, height, or both; the missing one keeps the Figma aspect ratio. */
  width?: number;
  height?: number;
  color?: string;
}

// Renders the vector paths exported from the Figma file.
export function Icon({ name, width, height, color = '#ffffff' }: Props) {
  const def = ICONS[name];
  const w = width ?? (height ? (height * def.w) / def.h : def.w);
  const h = height ?? (width ? (width * def.h) / def.w : def.h);
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${def.w} ${def.h}`}>
      {def.layers.map((l, i) => (
        <G key={i} transform={`translate(${l.x} ${l.y})`}>
          <Path d={l.d} fill={color} />
        </G>
      ))}
    </Svg>
  );
}
