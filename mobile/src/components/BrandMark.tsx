import Svg, { Path, Rect } from 'react-native-svg';

/** The WhatInside mark: a storage box with a sprout and a "fresh" check — same as the app icon. */
export function BrandMark({ size = 40, fg = '#FFFFFF', check = '#1B5E3B', leaf = '#9BE08A', leaf2 = '#6CC45C' }: {
  size?: number; fg?: string; check?: string; leaf?: string; leaf2?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M32 21 C32 16 32 13 32 10" stroke={leaf2} strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <Path d="M32 13 C26 13 21.5 9.5 21 4 C26.8 4 31.2 7.4 32 13 Z" fill={leaf} />
      <Path d="M32 11 C37.6 11.4 42.6 8 43.4 2 C37.4 2 32.8 5.6 32 11 Z" fill={leaf2} />
      <Rect x={9} y={19} width={46} height={9} rx={4.5} fill={fg} />
      <Path d="M13 29 H51 V49 a8 8 0 0 1 -8 8 H21 a8 8 0 0 1 -8 -8 Z" fill={fg} />
      <Path d="M23.5 42 l6 6 l11.5 -12" stroke={check} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round"
            fill="none" />
    </Svg>
  );
}
