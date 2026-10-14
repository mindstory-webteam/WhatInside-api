import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/** Flat onboarding illustrations, drawn in the brand palette (no image assets needed). */
const C = {
  bg: colors.secondarySoft, deep: colors.primary, leaf: colors.secondary, light: '#9BE08A', white: '#FFFFFF',
  amber: colors.warningStrong, amberSoft: '#FFE7B3', red: '#E5484D', line: '#CFE3D4', ink: '#2C4A38',
};

export function FridgeArt({ size = 260 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 260 220">
      <Circle cx={130} cy={112} r={98} fill={C.bg} />
      <Circle cx={212} cy={44} r={14} fill={C.light} opacity={0.6} />
      <Circle cx={40} cy={176} r={9} fill={C.leaf} opacity={0.35} />
      {/* fridge */}
      <Rect x={78} y={30} width={104} height={168} rx={18} fill={C.white} stroke={C.deep} strokeWidth={4} />
      <Path d="M78 86 H182" stroke={C.deep} strokeWidth={4} />
      <Rect x={164} y={44} width={6} height={28} rx={3} fill={C.deep} />
      <Rect x={164} y={100} width={6} height={36} rx={3} fill={C.deep} />
      {/* shelves */}
      <Path d="M90 132 H152 M90 168 H152" stroke={C.line} strokeWidth={3} strokeLinecap="round" />
      {/* milk carton */}
      <Path d="M96 112 l6 -10 h12 l6 10 v20 h-24 Z" fill={C.white} stroke={C.ink} strokeWidth={2.5} strokeLinejoin="round" />
      <Rect x={100} y={116} width={16} height={7} rx={2} fill={C.leaf} />
      {/* jar */}
      <Rect x={126} y={110} width={22} height={22} rx={6} fill={C.amberSoft} stroke={C.ink} strokeWidth={2.5} />
      <Rect x={124} y={104} width={26} height={7} rx={3} fill={C.amber} />
      {/* apple + veg */}
      <Circle cx={104} cy={156} r={10} fill={C.red} />
      <Path d="M104 146 q2 -6 8 -6" stroke={C.ink} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Rect x={122} y={146} width={26} height={20} rx={8} fill={C.light} stroke={C.ink} strokeWidth={2.5} />
      {/* freezer snowflake */}
      <G stroke={C.leaf} strokeWidth={3} strokeLinecap="round">
        <Path d="M118 46 v24 M106 52 l24 12 M106 64 l24 -12" />
      </G>
      {/* date tag */}
      <G>
        <Rect x={170} y={140} width={66} height={30} rx={10} fill={C.deep} />
        <Circle cx={184} cy={155} r={5} fill={C.light} />
        <Rect x={194} y={150} width={32} height={4} rx={2} fill={C.white} />
        <Rect x={194} y={158} width={20} height={4} rx={2} fill={C.light} />
      </G>
    </Svg>
  );
}

export function ScanArt({ size = 260 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 260 220">
      <Circle cx={130} cy={112} r={98} fill={C.bg} />
      <Circle cx={44} cy={52} r={12} fill={C.light} opacity={0.6} />
      {/* phone */}
      <Rect x={84} y={22} width={92} height={180} rx={20} fill={C.deep} />
      <Rect x={92} y={34} width={76} height={156} rx={13} fill={C.white} />
      {/* product label */}
      <Rect x={102} y={56} width={56} height={84} rx={8} fill={C.amberSoft} />
      <Rect x={110} y={66} width={40} height={6} rx={3} fill={C.ink} />
      <Rect x={110} y={78} width={28} height={4} rx={2} fill={C.ink} opacity={0.5} />
      <Rect x={110} y={88} width={34} height={4} rx={2} fill={C.ink} opacity={0.5} />
      {/* highlighted expiry line */}
      <Rect x={106} y={104} width={48} height={16} rx={4} fill={C.light} />
      <Rect x={110} y={110} width={40} height={4} rx={2} fill={C.deep} />
      <Rect x={110} y={126} width={22} height={4} rx={2} fill={C.ink} opacity={0.5} />
      {/* scan frame */}
      <G stroke={C.leaf} strokeWidth={4} strokeLinecap="round" fill="none">
        <Path d="M98 64 v-12 h12 M150 52 h12 v12 M162 132 v12 h-12 M110 144 h-12 v-12" />
      </G>
      <Rect x={98} y={96} width={64} height={3} rx={1.5} fill={C.leaf} opacity={0.8} />
      {/* result chip */}
      <G>
        <Rect x={150} y={150} width={84} height={34} rx={12} fill={C.white} stroke={C.line} strokeWidth={2} />
        <Circle cx={168} cy={167} r={9} fill={C.leaf} />
        <Path d="M163.5 167 l3 3 l6 -6" stroke={C.white} strokeWidth={2.5} fill="none" strokeLinecap="round"
              strokeLinejoin="round" />
        <Rect x={182} y={160} width={40} height={5} rx={2.5} fill={C.ink} />
        <Rect x={182} y={170} width={26} height={4} rx={2} fill={C.ink} opacity={0.45} />
      </G>
    </Svg>
  );
}

export function ReminderArt({ size = 260 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 260 220">
      <Circle cx={130} cy={112} r={98} fill={C.bg} />
      <Circle cx={218} cy={170} r={11} fill={C.light} opacity={0.6} />
      {/* calendar */}
      <Rect x={40} y={70} width={78} height={82} rx={14} fill={C.white} stroke={C.deep} strokeWidth={4} />
      <Rect x={40} y={70} width={78} height={22} rx={11} fill={C.deep} />
      <Rect x={40} y={82} width={78} height={10} fill={C.deep} />
      <Rect x={58} y={62} width={6} height={16} rx={3} fill={C.ink} />
      <Rect x={94} y={62} width={6} height={16} rx={3} fill={C.ink} />
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
        <Rect key={`${r}${c}`} x={52 + c * 15} y={102 + r * 15} width={9} height={9} rx={2.5}
              fill={r === 1 && c === 2 ? C.amber : C.line} />
      )))}
      {/* bell */}
      <G>
        <Path d="M160 64 c-20 0 -32 16 -32 34 v22 l-10 14 h84 l-10 -14 v-22 c0 -18 -12 -34 -32 -34 z" fill={C.amber} />
        <Path d="M150 140 a10 10 0 0 0 20 0" fill={C.amber} />
        <Rect x={155} y={52} width={10} height={14} rx={5} fill={C.amber} />
        <Path d="M196 72 q10 10 10 26 M124 72 q-10 10 -10 26" stroke={C.leaf} strokeWidth={4} fill="none"
              strokeLinecap="round" />
      </G>
      {/* notification card */}
      <G>
        <Rect x={118} y={156} width={118} height={40} rx={13} fill={C.white} stroke={C.line} strokeWidth={2} />
        <Rect x={128} y={166} width={20} height={20} rx={6} fill={C.deep} />
        <Path d="M133 176 l4 4 l7 -8" stroke={C.white} strokeWidth={2.4} fill="none" strokeLinecap="round"
              strokeLinejoin="round" />
        <Rect x={156} y={168} width={66} height={5} rx={2.5} fill={C.ink} />
        <Rect x={156} y={178} width={44} height={4} rx={2} fill={C.ink} opacity={0.45} />
      </G>
    </Svg>
  );
}
