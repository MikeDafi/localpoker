import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../theme/theme';

interface IconProps {
  size?: number;
  color?: string;
}

export function FriendsIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="8" cy="8" r="3.2" fill={color} />
      <Circle cx="16" cy="8.5" r="2.8" fill={color} opacity={0.85} />
      <Path d="M2.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5z" fill={color} />
      <Path d="M13.5 19c.2-2.6 2-4.6 4.3-4.6 2.2 0 3.7 1.7 3.7 4.6z" fill={color} opacity={0.85} />
    </Svg>
  );
}

export function BotIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4" y="7" width="16" height="12" rx="4" fill={color} />
      <Circle cx="9.5" cy="13" r="1.8" fill="#22ABE4" />
      <Circle cx="14.5" cy="13" r="1.8" fill="#22ABE4" />
      <Rect x="11" y="2.5" width="2" height="4" rx="1" fill={color} />
      <Circle cx="12" cy="2.5" r="1.6" fill={color} />
    </Svg>
  );
}

export function StatsIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4" y="12" width="3.6" height="8" rx="1.4" fill={color} />
      <Rect x="10.2" y="7" width="3.6" height="13" rx="1.4" fill={color} />
      <Rect x="16.4" y="4" width="3.6" height="16" rx="1.4" fill={color} />
    </Svg>
  );
}

export function ProfileIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="8" r="4" fill={color} />
      <Path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z" fill={color} />
    </Svg>
  );
}

export function GiftIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4" y="10" width="16" height="10" rx="2" fill={color} />
      <Rect x="3" y="7" width="18" height="4" rx="1.5" fill={color} />
      <Rect x="11" y="7" width="2" height="13" fill="#22ABE4" opacity={0.5} />
      <Path d="M12 7c-2-3-6-2-6 0 2 .6 4 .3 6 0z" fill={color} />
      <Path d="M12 7c2-3 6-2 6 0-2 .6-4 .3-6 0z" fill={color} />
    </Svg>
  );
}

export function CartIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 4h2l2 11h11l2-7H7" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="9" cy="19" r="1.6" fill={color} />
      <Circle cx="17" cy="19" r="1.6" fill={color} />
    </Svg>
  );
}

export function SpadeIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3C8 7 5 9 5 13a3.5 3.5 0 006 2.4A3.5 3.5 0 0019 13c0-4-3-6-7-10z" fill={color} />
      <Path d="M11 15h2l1 5h-4z" fill={color} />
    </Svg>
  );
}

export function ChevronLeft({ size = 26, color = '#2B3A45' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 5l-7 7 7 7" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SettingsIcon({ size = 30, color = '#fff' }: IconProps) {
  /*
   * A cog, drawn as one path with a genuine hole punched through it.
   *
   * The previous version filled the centre with a hardcoded `#FFFFFF` circle
   * on top of a `color` body. Every place this is used draws it white on a
   * dark button, so the hole was white on white: invisible. What was left was
   * a spiky white disc, which is why it did not read as a gear. The teeth
   * were part of it too, built from a 0.13 radian half width that made eight
   * thin spikes rather than eight teeth.
   *
   * `fillRule="evenodd"` is what makes the hole real, so the button's own
   * colour shows through and the icon works on any background.
   */
  const cx = 12, cy = 12;
  const tip = 11.2;     // how far a tooth reaches
  const body = 8.2;     // the solid disc the teeth stand on
  const hole = 3.6;     // the bore through the middle
  const teeth = 8;
  const half = Math.PI / teeth;   // angular half-pitch, one tooth plus one gap
  const at = (ang: number, r: number) => `${(cx + Math.cos(ang) * r).toFixed(2)} ${(cy + Math.sin(ang) * r).toFixed(2)}`;

  let d = '';
  for (let i = 0; i < teeth; i++) {
    const mid = (i / teeth) * Math.PI * 2;
    // Wider at the root than at the tip, which is what a tooth looks like and
    // what stops the gaps closing up at small sizes.
    const root = half * 0.58;
    const crown = half * 0.38;
    d += `M ${at(mid - root, body - 0.6)} `;
    d += `L ${at(mid - crown, tip)} `;
    d += `L ${at(mid + crown, tip)} `;
    d += `L ${at(mid + root, body - 0.6)} Z `;
  }
  // The disc, then the bore. Drawn as two arc pairs because a circle element
  // cannot take part in the same path's fill rule.
  const circle = (r: number) =>
    `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z `;
  d += circle(body) + circle(hole);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

export function PaletteIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3a9 9 0 000 18c1.4 0 2-1 2-2 0-1.3-1-1.5-1-2.6 0-.8.7-1.4 1.5-1.4H17a4 4 0 004-4c0-4.4-4-8-9-8z" fill={color} />
      <Circle cx="7.5" cy="11" r="1.3" fill="#22ABE4" />
      <Circle cx="10" cy="7.5" r="1.3" fill="#E8503A" />
      <Circle cx="14" cy="7.5" r="1.3" fill="#3FB56B" />
      <Circle cx="16.5" cy="11" r="1.3" fill="#F5C518" />
    </Svg>
  );
}

export function CoinIcon({ size = 30, color = '#F5C518' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" fill={color} stroke="#D9A400" strokeWidth={1.5} />
      <Circle cx="12" cy="12" r="6" fill="none" stroke="#D9A400" strokeWidth={1} opacity={0.6} />
      <Path d="M12 8v8M9.5 10.2c0-1 1-1.7 2.5-1.7s2.5.6 2.5 1.6-1 1.4-2.5 1.4-2.5.5-2.5 1.5 1 1.6 2.5 1.6 2.5-.7 2.5-1.7" fill="none" stroke="#8A6D00" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

export function SoundIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 9h3l4-3.5v13L7 15H4z" fill={color} />
      <Path d="M15.5 8.5a4 4 0 010 7" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M18 6a7 7 0 010 12" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function SparklesIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" fill={color} />
      <Path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" fill={color} opacity={0.85} />
    </Svg>
  );
}

export function AccessibilityIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="4.5" r="2" fill={color} />
      <Path d="M4 8h16" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M12 8v6m0 0l-3 6m3-6l3 6" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function TargetIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.5" fill="none" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="12" r="4.5" fill="none" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="12" r="1.6" fill={color} />
    </Svg>
  );
}

export function SpadeSuitIcon({ size = 30, color = '#25313B' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.5C8.5 6.5 5 8.5 5 12a3.4 3.4 0 005.6 2.6C10.3 16.5 9.4 18 8 19h8c-1.4-1-2.3-2.5-2.6-4.4A3.4 3.4 0 0019 12c0-3.5-3.5-5.5-7-9.5z" fill={color} />
    </Svg>
  );
}

/**
 * Turning a card over.
 *
 * A card back tipped behind, a face upright in front with a proper spade on
 * it, and an arrow curving from the one to the other. A single card on its
 * own reads as "a card" rather than as the act of showing one, and the arrow
 * is what makes it a verb. Used by the showdown toggle, which has no room for
 * a label and has to say "turn these over" by itself.
 */
export function CardFlipIcon({ size = 30, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect
        x="2.4"
        y="8.4"
        width="8"
        height="11.6"
        rx="1.7"
        fill={color}
        opacity={0.42}
        transform="rotate(-9 6.4 14.2)"
      />
      <Rect x="12.8" y="8.4" width="8.4" height="11.6" rx="1.7" fill={color} />
      {/* The app's own spade, shrunk onto the card face. */}
      <Path
        d="M12 2.5C8.5 6.5 5 8.5 5 12a3.4 3.4 0 005.6 2.6C10.3 16.5 9.4 18 8 19h8c-1.4-1-2.3-2.5-2.6-4.4A3.4 3.4 0 0019 12c0-3.5-3.5-5.5-7-9.5z"
        fill={colors.surface}
        transform="translate(14.6 10.6) scale(0.34 0.345) translate(-5 -2.5)"
      />
      <Path
        d="M5.6 6.1C8 2.6 13.4 1.9 16.8 4.2"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <Path d="M18.9 5.4l-4.3.3 2-3.4z" fill={color} />
    </Svg>
  );
}
