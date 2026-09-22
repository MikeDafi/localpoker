import React from 'react';
import Svg, {
  Circle, Path, Ellipse, Rect, G, Defs, ClipPath, LinearGradient, RadialGradient, Stop,
} from 'react-native-svg';
import {
  PalConfig, SKIN_TONES, HAIR_COLORS, EYE_COLORS, BG_COLORS, SHIRT_COLORS,
  HEAD_SHAPES, HAIR_STYLES, EYEBROW_STYLES, EYE_STYLES, NOSE_STYLES, MOUTH_STYLES,
  FACIAL_HAIR, GLASSES, HEADWEAR, BG_STYLES, normalizePal,
} from '../avatar/palConfig';

export type PalExpression = 'idle' | 'happy' | 'sad' | 'think' | 'surprised' | 'blink';

export interface PalAvatarProps {
  config: PalConfig;
  size?: number;
  expression?: PalExpression;
  clip?: boolean;
}

const INK = '#243141';
const SOFT_INK = '#324255';
const MOUTH_INK = '#74342F';
let uid = 0;

/** Pure SVG renderer for a Pal. Draws every configured feature. */
export function PalAvatar({ config, size = 72, expression = 'idle', clip = true }: PalAvatarProps) {
  const c = normalizePal(config);
  const id = React.useMemo(() => `pal${uid++}`, []);
  const skin = SKIN_TONES[c.skinTone % SKIN_TONES.length];
  const hair = HAIR_COLORS[c.hairColor % HAIR_COLORS.length];
  const eyeC = EYE_COLORS[c.eyeColor % EYE_COLORS.length];
  const bg = BG_COLORS[c.bgColor % BG_COLORS.length];
  const shirt = SHIRT_COLORS[c.shirtColor % SHIRT_COLORS.length];
  const hatC = SHIRT_COLORS[c.headwearColor % SHIRT_COLORS.length];
  const headShape = HEAD_SHAPES[c.headShape % HEAD_SHAPES.length];
  const hairStyle = HAIR_STYLES[c.hairStyle % HAIR_STYLES.length];
  const browStyle = EYEBROW_STYLES[c.eyebrowStyle % EYEBROW_STYLES.length];
  const eyeStyle = expression === 'blink' ? 'sleepy' : EYE_STYLES[c.eyeStyle % EYE_STYLES.length];
  const noseStyle = NOSE_STYLES[c.noseStyle % NOSE_STYLES.length];
  const mouthStyle =
    expression === 'happy' ? 'grin'
      : expression === 'sad' ? 'frown'
        : expression === 'surprised' ? 'ohh'
          : expression === 'think' ? 'smirk'
            : MOUTH_STYLES[c.mouthStyle % MOUTH_STYLES.length];
  const facialHair = FACIAL_HAIR[c.facialHair % FACIAL_HAIR.length];
  const glasses = GLASSES[c.glasses % GLASSES.length];
  const headwear = HEADWEAR[c.headwear % HEADWEAR.length];
  const bgStyle = BG_STYLES[c.bgStyle % BG_STYLES.length];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={`${id}clip`}>
          <Circle cx="50" cy="50" r="50" />
        </ClipPath>
        <LinearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={lighten(bg, 0.34)} />
          <Stop offset="0.58" stopColor={bg} />
          <Stop offset="1" stopColor={shade(bg, 0.1)} />
        </LinearGradient>
        <RadialGradient id={`${id}bgGlow`} cx="35%" cy="24%" rx="72%" ry="68%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.72} />
          <Stop offset="0.52" stopColor={lighten(bg, 0.22)} stopOpacity={0.34} />
          <Stop offset="1" stopColor={bg} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}vignette`} cx="50%" cy="50%" rx="64%" ry="64%">
          <Stop offset="0.62" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor={shade(bg, 0.38)} stopOpacity={0.22} />
        </RadialGradient>
        <RadialGradient id={`${id}floorShadow`} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#182130" stopOpacity={0.24} />
          <Stop offset="1" stopColor="#182130" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${id}skin`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lighten(skin, 0.15)} />
          <Stop offset="0.58" stopColor={skin} />
          <Stop offset="1" stopColor={shade(skin, 0.09)} />
        </LinearGradient>
        <LinearGradient id={`${id}skinRim`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.42} />
          <Stop offset="0.54" stopColor={lighten(skin, 0.16)} stopOpacity={0.16} />
          <Stop offset="1" stopColor={shade(skin, 0.2)} stopOpacity={0.18} />
        </LinearGradient>
        <RadialGradient id={`${id}cheek`} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#FF8FA3" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#FF8FA3" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${id}shirt`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lighten(shirt, 0.24)} />
          <Stop offset="0.56" stopColor={shirt} />
          <Stop offset="1" stopColor={shade(shirt, 0.22)} />
        </LinearGradient>
        <LinearGradient id={`${id}hair`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lighten(hair, 0.18)} />
          <Stop offset="0.52" stopColor={hair} />
          <Stop offset="1" stopColor={shade(hair, 0.28)} />
        </LinearGradient>
        <LinearGradient id={`${id}hairShine`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.3} />
          <Stop offset="0.45" stopColor={lighten(hair, 0.34)} stopOpacity={0.2} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id={`${id}eye`} cx="35%" cy="28%" rx="70%" ry="70%">
          <Stop offset="0" stopColor={lighten(eyeC, 0.52)} />
          <Stop offset="0.48" stopColor={eyeC} />
          <Stop offset="1" stopColor={shade(eyeC, 0.35)} />
        </RadialGradient>
        <LinearGradient id={`${id}lens`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.36} />
          <Stop offset="0.42" stopColor="#C7F1FF" stopOpacity={0.13} />
          <Stop offset="1" stopColor="#0F172A" stopOpacity={0.04} />
        </LinearGradient>
        <LinearGradient id={`${id}hat`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lighten(hatC, 0.25)} />
          <Stop offset="0.58" stopColor={hatC} />
          <Stop offset="1" stopColor={shade(hatC, 0.22)} />
        </LinearGradient>
      </Defs>

      <G clipPath={clip ? `url(#${id}clip)` : undefined}>
        <Background style={bgStyle} bg={bg} id={id} />
        <Ellipse cx="50" cy="89" rx="28" ry="7" fill={`url(#${id}floorShadow)`} />
        <Shoulders id={id} skin={skin} shirt={shirt} />
        <BackHair style={hairStyle} color={hair} id={id} />
        <Ears skin={skin} id={id} />
        <Head shape={headShape} skin={skin} id={id} />
        <Cheeks blush={c.blush} id={id} expression={expression} />
        <Brows style={browStyle} color={hair} expression={expression} />
        <Eyes style={eyeStyle} color={eyeC} id={id} expression={expression} />
        <Nose style={noseStyle} skin={skin} />
        {c.freckles && <Freckles skin={skin} />}
        <FacialHairPart style={facialHair} color={hair} id={id} />
        <Mouth style={mouthStyle} expression={expression} />
        <FrontHair style={hairStyle} color={hair} id={id} />
        <GlassesPart style={glasses} id={id} />
        <Headwear style={headwear} color={hatC} id={id} />
      </G>
    </Svg>
  );
}

function Background({ style, bg, id }: { style: string; bg: string; id: string }) {
  const sparkle = lighten(bg, 0.48);
  const rayColor = lighten(bg, 0.3);
  return (
    <>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id}bg)`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id}bgGlow)`} />
      {style === 'ring' && (
        <>
          <Circle cx="50" cy="50" r="39" fill="none" stroke="#FFFFFF" strokeWidth="8" opacity={0.34} />
          <Circle cx="50" cy="50" r="30" fill="none" stroke={shade(bg, 0.12)} strokeWidth="1.5" opacity={0.22} />
        </>
      )}
      {style === 'rays' && (
        <G opacity={0.25}>
          {Array.from({ length: 12 }).map((_, i) => {
            const a1 = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const a2 = ((i + 0.42) / 12) * Math.PI * 2 - Math.PI / 2;
            const x1 = 50 + Math.cos(a1) * 80;
            const y1 = 50 + Math.sin(a1) * 80;
            const x2 = 50 + Math.cos(a2) * 80;
            const y2 = 50 + Math.sin(a2) * 80;
            return <Path key={i} d={`M50 50 L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z`} fill={i % 2 === 0 ? rayColor : '#FFFFFF'} opacity={i % 2 === 0 ? 0.4 : 0.18} />;
          })}
        </G>
      )}
      {style === 'gradient' && (
        <>
          <Circle cx="77" cy="22" r="16" fill="#FFFFFF" opacity={0.13} />
          <Circle cx="20" cy="72" r="18" fill={shade(bg, 0.08)} opacity={0.12} />
        </>
      )}
      {style === 'solid' && (
        <>
          <Circle cx="23" cy="25" r="4" fill={sparkle} opacity={0.33} />
          <Circle cx="78" cy="68" r="3.2" fill="#FFFFFF" opacity={0.22} />
        </>
      )}
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id}vignette)`} />
    </>
  );
}

function Shoulders({ id, skin, shirt }: { id: string; skin: string; shirt: string }) {
  return (
    <G>
      <Path d="M16 100 C17 84 28 76 41 74 L59 74 C72 76 83 84 84 100 Z" fill={`url(#${id}shirt)`} />
      <Path d="M21 98 C28 84 38 79 50 79 C62 79 72 84 79 98" stroke={lighten(shirt, 0.22)} strokeWidth="3" opacity={0.28} fill="none" strokeLinecap="round" />
      <Path d="M40 75 C42 84 58 84 60 75 L60 70 L40 70 Z" fill={`url(#${id}skin)`} />
      <Path d="M39 76 C44 83 56 83 61 76 C57 86 43 86 39 76 Z" fill={shade(skin, 0.12)} opacity={0.2} />
      <Path d="M35 76 C39 83 44 87 50 87 C56 87 61 83 65 76 L73 80 C67 91 59 97 50 100 C41 97 33 91 27 80 Z" fill={shade(shirt, 0.1)} opacity={0.22} />
      <Path d="M38 76 C42 83 46 86 50 87 C54 86 58 83 62 76" stroke="#FFFFFF" strokeWidth="2" opacity={0.28} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Ears({ skin, id }: { skin: string; id: string }) {
  return (
    <G>
      <Ellipse cx="20.2" cy="53" rx="6.6" ry="8.2" fill={`url(#${id}skin)`} />
      <Ellipse cx="79.8" cy="53" rx="6.6" ry="8.2" fill={`url(#${id}skin)`} />
      <Path d="M20.8 50 C17.6 52.4 17.8 57.1 21.2 58.2" stroke={shade(skin, 0.14)} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity={0.62} />
      <Path d="M79.2 50 C82.4 52.4 82.2 57.1 78.8 58.2" stroke={shade(skin, 0.14)} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity={0.62} />
    </G>
  );
}

function Head({ shape, skin, id }: { shape: string; skin: string; id: string }) {
  const rim = lighten(skin, 0.28);
  const jaw = shade(skin, 0.12);
  switch (shape) {
    case 'oval':
      return (
        <G>
          <Ellipse cx="50" cy="52" rx="27.5" ry="34" fill={`url(#${id}skin)`} />
          <Path d="M29 55 C30 76 40 85 50 85 C60 85 70 76 71 55" fill={jaw} opacity={0.1} />
          <Path d="M31 35 C37 26 47 24 57 26" stroke={rim} strokeWidth="2" opacity={0.35} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'square':
      return (
        <G>
          <Path d="M24 40 C24 29 34 24 50 24 C66 24 76 29 76 40 L76 65 C76 79 66 85 50 85 C34 85 24 79 24 65 Z" fill={`url(#${id}skin)`} />
          <Path d="M25 61 C28 78 37 85 50 85 C63 85 72 78 75 61 L75 68 C74 82 64 88 50 88 C36 88 26 82 25 68 Z" fill={jaw} opacity={0.11} />
          <Path d="M29 37 C35 29 45 27 57 28" stroke={rim} strokeWidth="2" opacity={0.34} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'heart':
      return (
        <G>
          <Path d="M23 44 C23 30 34 24 50 24 C66 24 77 30 77 44 C77 69 62 81 50 86 C38 81 23 69 23 44 Z" fill={`url(#${id}skin)`} />
          <Path d="M28 60 C33 73 42 82 50 86 C58 82 67 73 72 60 C68 78 59 87 50 91 C41 87 32 78 28 60 Z" fill={jaw} opacity={0.1} />
          <Path d="M31 38 C38 28 50 27 60 30" stroke={rim} strokeWidth="2" opacity={0.34} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'long':
      return (
        <G>
          <Ellipse cx="50" cy="54" rx="25" ry="36" fill={`url(#${id}skin)`} />
          <Path d="M30 60 C32 80 41 90 50 90 C59 90 68 80 70 60" fill={jaw} opacity={0.1} />
          <Path d="M31 36 C37 27 47 25 58 27" stroke={rim} strokeWidth="2" opacity={0.34} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'round':
    default:
      return (
        <G>
          <Ellipse cx="50" cy="52" rx="31" ry="32.5" fill={`url(#${id}skin)`} />
          <Path d="M25 55 C28 76 39 85 50 85 C61 85 72 76 75 55 C73 75 63 88 50 88 C37 88 27 75 25 55 Z" fill={jaw} opacity={0.1} />
          <Path d="M29 36 C36 27 47 25 59 28" stroke={rim} strokeWidth="2.1" opacity={0.35} fill="none" strokeLinecap="round" />
        </G>
      );
  }
}

function Cheeks({ blush, id, expression }: { blush: boolean; id: string; expression: PalExpression }) {
  const visible = blush || expression === 'happy' || expression === 'surprised';
  const opacity = blush ? 0.86 : expression === 'happy' ? 0.38 : expression === 'surprised' ? 0.24 : 0.18;
  if (!visible) {
    return (
      <G opacity={0.18}>
        <Ellipse cx="31" cy="61" rx="8" ry="5" fill={`url(#${id}cheek)`} />
        <Ellipse cx="69" cy="61" rx="8" ry="5" fill={`url(#${id}cheek)`} />
      </G>
    );
  }
  return (
    <G opacity={opacity}>
      <Ellipse cx="31" cy="61" rx="9" ry="5.4" fill={`url(#${id}cheek)`} />
      <Ellipse cx="69" cy="61" rx="9" ry="5.4" fill={`url(#${id}cheek)`} />
    </G>
  );
}

function BackHair({ style, color, id }: { style: string; color: string; id: string }) {
  const shadow = shade(color, 0.34);
  switch (style) {
    case 'long':
      return (
        <G>
          <Path d="M18 43 C18 25 31 17 50 17 C69 17 82 25 82 43 L81 92 L66 92 C68 75 66 57 61 47 C54 43 46 43 39 47 C34 57 32 75 34 92 L19 92 Z" fill={`url(#${id}hair)`} />
          <Path d="M29 36 C34 24 43 21 53 22" stroke={`url(#${id}hairShine)`} strokeWidth="4" fill="none" strokeLinecap="round" opacity={0.75} />
          <Path d="M20 69 C25 78 31 83 37 84" stroke={shadow} strokeWidth="3" opacity={0.22} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'ponytail':
      return (
        <G>
          <Path d="M72 34 C88 36 93 49 89 63 C85 78 73 80 70 69 C78 58 77 45 68 38 Z" fill={`url(#${id}hair)`} />
          <Path d="M78 43 C86 50 84 63 77 68" stroke={`url(#${id}hairShine)`} strokeWidth="3" opacity={0.55} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'bob':
      return (
        <G>
          <Path d="M20 42 C20 26 32 18 50 18 C68 18 80 26 80 42 L78 69 L65 68 L64 48 C55 44 45 44 36 48 L35 68 L22 69 Z" fill={`url(#${id}hair)`} />
          <Path d="M30 33 C37 23 48 21 60 24" stroke={`url(#${id}hairShine)`} strokeWidth="4" opacity={0.7} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'afro':
      return (
        <G>
          {[24, 34, 45, 57, 68, 76].map((x, i) => (
            <Circle key={i} cx={x} cy={38 + (i % 2) * 3} r={15 - (i % 3)} fill={`url(#${id}hair)`} />
          ))}
          <Circle cx="50" cy="37" r="31" fill={`url(#${id}hair)`} />
          <Path d="M29 30 C39 20 54 18 66 24" stroke={`url(#${id}hairShine)`} strokeWidth="5" opacity={0.45} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'emo':
      return (
        <G>
          <Path d="M18 43 C18 25 32 18 51 18 C72 18 83 30 82 47 L78 72 L66 71 L65 49 C57 45 45 44 34 49 L31 72 L20 72 Z" fill={`url(#${id}hair)`} />
          <Path d="M27 33 C42 21 62 22 76 42" stroke={`url(#${id}hairShine)`} strokeWidth="4" opacity={0.55} fill="none" strokeLinecap="round" />
        </G>
      );
    default:
      return null;
  }
}

function FrontHair({ style, color, id }: { style: string; color: string; id: string }) {
  const outline = shade(color, 0.24);
  const shine = `url(#${id}hairShine)`;
  const fill = `url(#${id}hair)`;
  switch (style) {
    case 'none':
    case 'bald-top':
      return null;
    case 'buzz':
      return (
        <G>
          <Path d="M22 44 C25 29 36 24 50 24 C64 24 75 29 78 44 C66 36 57 33 50 33 C43 33 34 36 22 44 Z" fill={fill} opacity={0.92} />
          <Path d="M31 35 C40 29 51 28 62 32" stroke={shine} strokeWidth="3" opacity={0.42} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'flat':
      return (
        <G>
          <Path d="M20 40 C29 24 39 18 51 18 C63 18 73 25 80 40 L79 33 C61 23 39 23 21 33 Z" fill={fill} stroke={outline} strokeWidth="0.7" />
          <Path d="M30 31 C42 22 58 23 70 32" stroke={shine} strokeWidth="4" opacity={0.62} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'spiky':
      return (
        <G>
          <Path d="M20 45 L27 24 L35 39 L43 19 L51 38 L60 18 L67 39 L76 24 L81 45 C65 34 36 34 20 45 Z" fill={fill} stroke={outline} strokeWidth="0.7" strokeLinejoin="round" />
          <Path d="M31 34 L43 23 M53 33 L61 22" stroke={shine} strokeWidth="3" opacity={0.5} strokeLinecap="round" />
        </G>
      );
    case 'curly':
      return (
        <G>
          {[29, 40, 52, 64, 72].map((x, i) => (
            <Circle key={i} cx={x} cy={31 - (i % 2) * 4} r={9.8} fill={fill} stroke={outline} strokeWidth="0.4" />
          ))}
          <Path d="M28 40 C38 30 62 30 73 40 C59 35 42 35 28 40 Z" fill={fill} />
          <Path d="M35 27 C44 21 57 21 66 27" stroke={shine} strokeWidth="3.5" opacity={0.52} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'wavy':
      return (
        <G>
          <Path d="M20 43 C25 29 33 27 39 35 C44 23 53 24 57 34 C63 23 73 29 80 43 C64 33 36 33 20 43 Z" fill={fill} stroke={outline} strokeWidth="0.6" />
          <Path d="M31 34 C39 27 47 29 53 33 C59 27 66 29 72 35" stroke={shine} strokeWidth="3" opacity={0.56} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'bun':
      return (
        <G>
          <Circle cx="50" cy="16" r="10" fill={fill} stroke={outline} strokeWidth="0.7" />
          <Path d="M22 43 C28 27 38 20 50 20 C62 20 72 27 78 43 C63 33 37 33 22 43 Z" fill={fill} stroke={outline} strokeWidth="0.6" />
          <Path d="M43 13 C48 9 55 10 59 15" stroke={shine} strokeWidth="2.8" opacity={0.55} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'mohawk':
      return (
        <G>
          <Path d="M43 13 C47 9 53 9 57 13 L55 42 L45 42 Z" fill={fill} stroke={outline} strokeWidth="0.7" />
          <Path d="M50 15 L50 38" stroke={shine} strokeWidth="3" opacity={0.5} strokeLinecap="round" />
        </G>
      );
    case 'side-part':
      return (
        <G>
          <Path d="M20 45 C21 30 32 22 51 21 C69 20 79 29 80 41 C70 32 57 30 44 31 C34 31 27 36 20 45 Z" fill={fill} stroke={outline} strokeWidth="0.7" />
          <Path d="M48 23 C42 30 32 34 23 39" stroke={shade(color, 0.3)} strokeWidth="1.5" opacity={0.55} fill="none" strokeLinecap="round" />
          <Path d="M53 25 C64 24 72 30 77 38" stroke={shine} strokeWidth="3" opacity={0.5} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'afro':
      return null;
    case 'ponytail':
    case 'long':
    case 'bob':
      return (
        <G>
          <Path d="M20 43 C22 28 34 20 50 20 C66 20 78 28 80 43 C66 32 57 29 50 29 C43 29 34 32 20 43 Z" fill={fill} stroke={outline} strokeWidth="0.5" />
          <Path d="M31 31 C40 24 54 23 66 29" stroke={shine} strokeWidth="4" opacity={0.58} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'emo':
      return (
        <G>
          <Path d="M20 42 C23 27 35 19 53 20 C67 21 77 30 81 44 C64 39 49 49 30 51 C25 49 22 46 20 42 Z" fill={fill} stroke={outline} strokeWidth="0.6" />
          <Path d="M33 29 C46 22 64 27 77 41" stroke={shine} strokeWidth="4" opacity={0.45} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'short':
    default:
      return (
        <G>
          <Path d="M22 45 C25 28 36 21 50 21 C64 21 75 28 78 45 C66 34 58 31 50 31 C42 31 34 34 22 45 Z" fill={fill} stroke={outline} strokeWidth="0.7" />
          <Path d="M31 33 C40 25 55 25 66 32" stroke={shine} strokeWidth="3.5" opacity={0.58} fill="none" strokeLinecap="round" />
        </G>
      );
  }
}

function Brows({ style, color, expression }: { style: string; color: string; expression: PalExpression }) {
  const y = expression === 'surprised' ? 34 : expression === 'sad' ? 40 : expression === 'think' ? 37 : style === 'raised' ? 37 : 39;
  const sw = style === 'thin' ? 1.8 : style === 'bushy' ? 4.3 : 2.7;
  const browColor = shade(color, 0.08);
  let dL = `M31 ${y} C35 ${y - 3} 40 ${y - 3.4} 45 ${y - 0.2}`;
  let dR = `M55 ${y - 0.2} C60 ${y - 3.4} 65 ${y - 3} 69 ${y}`;

  if (style === 'angry') {
    dL = `M31 ${y - 2} L45 ${y + 2.4}`;
    dR = `M55 ${y + 2.4} L69 ${y - 2}`;
  } else if (style === 'worried' || expression === 'sad') {
    dL = `M31 ${y + 1.8} C36 ${y - 1.6} 41 ${y - 1.6} 45 ${y - 2.8}`;
    dR = `M55 ${y - 2.8} C59 ${y - 1.6} 64 ${y - 1.6} 69 ${y + 1.8}`;
  } else if (style === 'flat') {
    dL = `M31 ${y} C36 ${y - 0.6} 40 ${y - 0.6} 45 ${y}`;
    dR = `M55 ${y} C60 ${y - 0.6} 64 ${y - 0.6} 69 ${y}`;
  } else if (style === 'raised' || expression === 'think') {
    dL = `M31 ${y + 1.4} C36 ${y - 2.8} 41 ${y - 3.2} 45 ${y - 1}`;
    dR = `M55 ${y + (expression === 'think' ? 1.8 : -1)} C60 ${y - 1.8} 65 ${y - 1.4} 69 ${y + 0.8}`;
  }

  return (
    <G>
      <Path d={dL} stroke="#FFFFFF" strokeWidth={sw + 1.1} fill="none" strokeLinecap="round" opacity={0.16} />
      <Path d={dR} stroke="#FFFFFF" strokeWidth={sw + 1.1} fill="none" strokeLinecap="round" opacity={0.16} />
      <Path d={dL} stroke={browColor} strokeWidth={sw} fill="none" strokeLinecap="round" />
      <Path d={dR} stroke={browColor} strokeWidth={sw} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Eyes({ style, color, id, expression }: { style: string; color: string; id: string; expression: PalExpression }) {
  const L = 37.6;
  const R = 62.4;
  const Y = expression === 'sad' ? 52.8 : 51.8;

  if (expression === 'blink' || style === 'sleepy') {
    return <ClosedEyes y={Y} mood={expression === 'happy' ? 'happy' : expression === 'sad' ? 'sad' : 'sleepy'} />;
  }
  if (expression === 'happy' && style !== 'star' && style !== 'wink') {
    return <ClosedEyes y={Y + 0.5} mood="happy" />;
  }
  if (expression === 'sad') {
    return (
      <G>
        <OpenEye cx={L} cy={Y} rx={5.6} ry={6.6} color={color} id={id} lid="sad" />
        <OpenEye cx={R} cy={Y} rx={5.6} ry={6.6} color={color} id={id} lid="sad" />
      </G>
    );
  }
  if (expression === 'surprised') {
    return (
      <G>
        <OpenEye cx={L} cy={Y - 0.5} rx={7.2} ry={8} color={color} id={id} wide />
        <OpenEye cx={R} cy={Y - 0.5} rx={7.2} ry={8} color={color} id={id} wide />
      </G>
    );
  }
  if (expression === 'think') {
    return (
      <G>
        <OpenEye cx={L} cy={Y} rx={5.8} ry={6.7} color={color} id={id} gazeX={-0.8} />
        <Path d={`M${R - 6.2} ${Y + 0.4} C${R - 2} ${Y - 2.4} ${R + 3} ${Y - 2.1} ${R + 6.2} ${Y + 0.1}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      </G>
    );
  }

  switch (style) {
    case 'happy':
      return <ClosedEyes y={Y + 0.3} mood="happy" />;
    case 'wink':
      return (
        <G>
          <OpenEye cx={L} cy={Y} rx={5.9} ry={6.7} color={color} id={id} gazeX={-0.3} />
          <Path d={`M${R - 6.5} ${Y} C${R - 2} ${Y - 3.8} ${R + 3.2} ${Y - 3.1} ${R + 6.5} ${Y + 0.2}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d={`M${R + 5.8} ${Y - 1.5} L${R + 8.2} ${Y - 3.4}`} stroke={INK} strokeWidth="1.8" strokeLinecap="round" opacity={0.75} />
        </G>
      );
    case 'dot':
      return (
        <G>
          <Circle cx={L} cy={Y} r="3.8" fill={INK} />
          <Circle cx={R} cy={Y} r="3.8" fill={INK} />
          <Circle cx={L - 1.1} cy={Y - 1.3} r="1" fill="#FFFFFF" opacity={0.9} />
          <Circle cx={R - 1.1} cy={Y - 1.3} r="1" fill="#FFFFFF" opacity={0.9} />
        </G>
      );
    case 'wide':
      return (
        <G>
          <OpenEye cx={L} cy={Y} rx={7} ry={7.6} color={color} id={id} wide />
          <OpenEye cx={R} cy={Y} rx={7} ry={7.6} color={color} id={id} wide />
        </G>
      );
    case 'star':
      return (
        <G>
          <Star cx={L} cy={Y} r={6} fill={`url(#${id}eye)`} stroke={shade(color, 0.28)} />
          <Star cx={R} cy={Y} r={6} fill={`url(#${id}eye)`} stroke={shade(color, 0.28)} />
          <Circle cx={L - 1.4} cy={Y - 2} r="1" fill="#FFFFFF" opacity={0.95} />
          <Circle cx={R - 1.4} cy={Y - 2} r="1" fill="#FFFFFF" opacity={0.95} />
        </G>
      );
    case 'cute':
      return (
        <G>
          <CuteEye cx={L} cy={Y} color={color} id={id} />
          <CuteEye cx={R} cy={Y} color={color} id={id} />
        </G>
      );
    case 'serious':
      return (
        <G>
          <NarrowEye cx={L} cy={Y} color={color} id={id} />
          <NarrowEye cx={R} cy={Y} color={color} id={id} />
        </G>
      );
    case 'oval':
      return (
        <G>
          <OpenEye cx={L} cy={Y} rx={5.2} ry={7} color={color} id={id} />
          <OpenEye cx={R} cy={Y} rx={5.2} ry={7} color={color} id={id} />
        </G>
      );
    case 'round':
    default:
      return (
        <G>
          <OpenEye cx={L} cy={Y} rx={6.2} ry={6.9} color={color} id={id} />
          <OpenEye cx={R} cy={Y} rx={6.2} ry={6.9} color={color} id={id} />
        </G>
      );
  }
}

function OpenEye({
  cx, cy, rx, ry, color, id, gazeX = 0, wide = false, lid,
}: { cx: number; cy: number; rx: number; ry: number; color: string; id: string; gazeX?: number; wide?: boolean; lid?: 'sad' }) {
  const irisR = wide ? 3.9 : Math.min(rx, ry) * 0.55;
  return (
    <G>
      <Ellipse cx={cx} cy={cy + 0.8} rx={rx + 0.8} ry={ry + 0.8} fill={shade(color, 0.6)} opacity={0.08} />
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#FFFDF8" stroke="#233044" strokeWidth="0.75" opacity={0.98} />
      <Circle cx={cx + gazeX} cy={cy + 0.2} r={irisR} fill={`url(#${id}eye)`} />
      <Circle cx={cx + gazeX + 0.2} cy={cy + 0.4} r={irisR * 0.45} fill={shade(color, 0.54)} opacity={0.88} />
      <Circle cx={cx + gazeX - irisR * 0.35} cy={cy - irisR * 0.45} r={irisR * 0.3} fill="#FFFFFF" opacity={0.96} />
      <Circle cx={cx + gazeX + irisR * 0.42} cy={cy - irisR * 0.06} r={irisR * 0.13} fill="#FFFFFF" opacity={0.78} />
      <Path d={`M${cx - rx + 1} ${cy - ry * 0.45} C${cx - rx * 0.4} ${cy - ry - 0.7} ${cx + rx * 0.4} ${cy - ry - 0.7} ${cx + rx - 1} ${cy - ry * 0.45}`} stroke="#FFFFFF" strokeWidth="1.2" opacity={0.5} fill="none" strokeLinecap="round" />
      {lid === 'sad' && <Path d={`M${cx - rx} ${cy - ry * 0.66} C${cx - rx * 0.35} ${cy - ry * 0.1} ${cx + rx * 0.35} ${cy - ry * 0.1} ${cx + rx} ${cy - ry * 0.66}`} stroke={SOFT_INK} strokeWidth="2.1" fill="none" strokeLinecap="round" opacity={0.8} />}
    </G>
  );
}

function CuteEye({ cx, cy, color, id }: { cx: number; cy: number; color: string; id: string }) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy} rx="5.1" ry="7.2" fill={INK} />
      <Ellipse cx={cx} cy={cy + 1.5} rx="3.1" ry="3.5" fill={`url(#${id}eye)`} opacity={0.6} />
      <Circle cx={cx - 1.6} cy={cy - 2.5} r="1.7" fill="#FFFFFF" />
      <Circle cx={cx + 1.6} cy={cy - 0.5} r="0.75" fill="#FFFFFF" opacity={0.8} />
      <Path d={`M${cx - 5.4} ${cy - 5.8} C${cx - 1.8} ${cy - 8.3} ${cx + 2.3} ${cy - 8.1} ${cx + 5.4} ${cy - 5.6}`} stroke={shade(color, 0.18)} strokeWidth="1" opacity={0.25} fill="none" strokeLinecap="round" />
    </G>
  );
}

function NarrowEye({ cx, cy, color, id }: { cx: number; cy: number; color: string; id: string }) {
  return (
    <G>
      <Path d={`M${cx - 6.4} ${cy - 1.5} C${cx - 2.5} ${cy - 3.9} ${cx + 3.1} ${cy - 3.5} ${cx + 6.4} ${cy - 1.2} C${cx + 2.8} ${cy + 2.5} ${cx - 2.9} ${cy + 2.6} ${cx - 6.4} ${cy - 1.5} Z`} fill="#FFFDF8" stroke={INK} strokeWidth="0.8" />
      <Circle cx={cx} cy={cy - 0.8} r="2.7" fill={`url(#${id}eye)`} />
      <Path d={`M${cx - 6.8} ${cy - 3.5} L${cx + 6.6} ${cy - 1}`} stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </G>
  );
}

function ClosedEyes({ y, mood }: { y: number; mood: 'happy' | 'sad' | 'sleepy' }) {
  const L = 37.6;
  const R = 62.4;
  if (mood === 'happy') {
    return (
      <G>
        <Path d={`M${L - 6.8} ${y + 1.2} C${L - 2.4} ${y - 4.6} ${L + 2.4} ${y - 4.6} ${L + 6.8} ${y + 1.2}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d={`M${R - 6.8} ${y + 1.2} C${R - 2.4} ${y - 4.6} ${R + 2.4} ${y - 4.6} ${R + 6.8} ${y + 1.2}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d={`M${L + 5.8} ${y - 0.2} L${L + 8.2} ${y - 2.3}`} stroke={INK} strokeWidth="1.8" strokeLinecap="round" opacity={0.7} />
        <Path d={`M${R + 5.8} ${y - 0.2} L${R + 8.2} ${y - 2.3}`} stroke={INK} strokeWidth="1.8" strokeLinecap="round" opacity={0.7} />
      </G>
    );
  }
  if (mood === 'sad') {
    return (
      <G>
        <Path d={`M${L - 6.4} ${y - 1} C${L - 2.4} ${y + 2.6} ${L + 2.4} ${y + 2.6} ${L + 6.4} ${y - 1}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d={`M${R - 6.4} ${y - 1} C${R - 2.4} ${y + 2.6} ${R + 2.4} ${y + 2.6} ${R + 6.4} ${y - 1}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      </G>
    );
  }
  return (
    <G>
      <Path d={`M${L - 6.8} ${y} C${L - 2.6} ${y + 0.8} ${L + 2.6} ${y + 0.8} ${L + 6.8} ${y}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Path d={`M${R - 6.8} ${y} C${R - 2.6} ${y + 0.8} ${R + 2.6} ${y + 0.8} ${R + 6.8} ${y}`} stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
    </G>
  );
}

function Star({ cx, cy, r, fill, stroke }: { cx: number; cy: number; r: number; fill: string; stroke?: string }) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  return <Path d={d + 'Z'} fill={fill} stroke={stroke} strokeWidth={stroke ? 0.8 : 0} strokeLinejoin="round" />;
}

function Nose({ style, skin }: { style: string; skin: string }) {
  const dark = shade(skin, 0.18);
  const high = lighten(skin, 0.24);
  switch (style) {
    case 'button':
      return (
        <G>
          <Ellipse cx="50" cy="60.6" rx="3.7" ry="2.8" fill={dark} opacity={0.42} />
          <Ellipse cx="49" cy="59.4" rx="1.3" ry="0.8" fill={high} opacity={0.62} />
        </G>
      );
    case 'line':
      return (
        <G>
          <Path d="M50.4 55.2 C49.4 58.4 49.5 60.8 51.2 62.7" stroke={dark} strokeWidth="2" strokeLinecap="round" fill="none" opacity={0.72} />
          <Path d="M48.9 57.1 C48.4 59 48.5 60.6 49.2 61.7" stroke={high} strokeWidth="0.9" strokeLinecap="round" fill="none" opacity={0.42} />
        </G>
      );
    case 'wide':
      return (
        <G>
          <Path d="M44.8 61.3 C47.2 64.2 52.8 64.2 55.2 61.3" stroke={dark} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity={0.72} />
          <Circle cx="46.5" cy="61.7" r="0.85" fill={dark} opacity={0.58} />
          <Circle cx="53.5" cy="61.7" r="0.85" fill={dark} opacity={0.58} />
        </G>
      );
    case 'none':
      return null;
    case 'dot':
    default:
      return (
        <G>
          <Circle cx="50" cy="60.5" r="2.15" fill={dark} opacity={0.45} />
          <Circle cx="49.3" cy="59.8" r="0.65" fill={high} opacity={0.65} />
        </G>
      );
  }
}

function Freckles({ skin }: { skin: string }) {
  const d = shade(skin, 0.22);
  return (
    <G opacity={0.66}>
      {[[39.2, 61.8], [43.2, 64], [35.4, 64.2], [60.8, 61.8], [56.8, 64], [64.6, 64.2], [32.8, 60.5], [67.2, 60.5]].map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={i > 5 ? 0.75 : 0.95} fill={d} />
      ))}
    </G>
  );
}

function Mouth({ style, expression }: { style: string; expression: PalExpression }) {
  const ink = MOUTH_INK;
  const sad = expression === 'sad';
  switch (style) {
    case 'grin':
      return (
        <G>
          <Path d="M38.5 68.2 C42.3 78.2 57.7 78.2 61.5 68.2 C55.3 72 44.7 72 38.5 68.2 Z" fill={ink} />
          <Path d="M41.2 68.4 C45.8 71.4 54.2 71.4 58.8 68.4 C55.2 69.8 44.8 69.8 41.2 68.4 Z" fill="#FFF8F0" opacity={0.95} />
          <Path d="M45.5 75 C48.2 76.6 51.8 76.6 54.5 75 C52.7 78.5 47.3 78.5 45.5 75 Z" fill="#FF7D96" opacity={0.75} />
        </G>
      );
    case 'open':
      return (
        <G>
          <Ellipse cx="50" cy="70.7" rx="7" ry="6.3" fill={ink} />
          <Path d="M44.4 69 C47.9 71.1 52.1 71.1 55.6 69" stroke="#FFF8F0" strokeWidth="2.3" strokeLinecap="round" opacity={0.92} />
          <Ellipse cx="50" cy="74.4" rx="4.2" ry="2.8" fill="#FF7692" opacity={0.85} />
        </G>
      );
    case 'neutral':
      return <Path d="M43 71.2 C47 72.1 53 72.1 57 71.2" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />;
    case 'small':
      return <Path d="M45.8 70.7 C48.2 74.1 51.8 74.1 54.2 70.7" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />;
    case 'smirk':
      return (
        <G>
          <Path d="M43.5 71 C48.4 74.2 55.2 72.8 59 68.9" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          <Circle cx="58.7" cy="68.9" r="1" fill="#FFFFFF" opacity={0.4} />
        </G>
      );
    case 'frown':
      return <Path d={sad ? 'M41.5 74 C46.5 68.2 53.5 68.2 58.5 74' : 'M42 73 C47.2 68.2 52.8 68.2 58 73'} stroke={ink} strokeWidth="3.1" fill="none" strokeLinecap="round" />;
    case 'tongue':
      return (
        <G>
          <Path d="M39.5 68 C43.2 77 56.8 77 60.5 68 C54.6 71.2 45.4 71.2 39.5 68 Z" fill={ink} />
          <Path d="M44 71.6 C47.8 69.8 52.2 69.8 56 71.6 C55.3 77.4 44.7 77.4 44 71.6 Z" fill="#F56F91" />
          <Path d="M50 72.4 L50 76.2" stroke="#D84F73" strokeWidth="1" strokeLinecap="round" opacity={0.65} />
        </G>
      );
    case 'ohh':
      return (
        <G>
          <Ellipse cx="50" cy="71" rx="5.4" ry="6.1" fill={ink} />
          <Ellipse cx="48.3" cy="68.8" rx="1.5" ry="1" fill="#FFFFFF" opacity={0.35} />
        </G>
      );
    case 'flat':
      return <Path d="M43.5 71.3 L56.5 71.3" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />;
    case 'smile':
    default:
      return (
        <G>
          <Path d="M40.8 69.8 C45.2 78.3 54.8 78.3 59.2 69.8" stroke={ink} strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <Path d="M45.2 74.2 C48.2 76.2 51.8 76.2 54.8 74.2" stroke="#FFFFFF" strokeWidth="1.2" opacity={0.28} fill="none" strokeLinecap="round" />
        </G>
      );
  }
}

function FacialHairPart({ style, color, id }: { style: string; color: string; id: string }) {
  const fill = `url(#${id}hair)`;
  switch (style) {
    case 'stubble':
      return (
        <G opacity={0.24}>
          <Path d="M31 64 C35 78 42 84 50 84 C58 84 65 78 69 64 C67 80 59 88 50 88 C41 88 33 80 31 64 Z" fill={shade(color, 0.12)} />
          {[[39, 69], [44, 73], [50, 75], [56, 73], [61, 69], [36, 65], [64, 65]].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r="0.65" fill={shade(color, 0.35)} />
          ))}
        </G>
      );
    case 'mustache':
      return (
        <G>
          <Path d="M39.5 64.3 C43 60.6 48 62.6 50 65.4 C52 62.6 57 60.6 60.5 64.3 C57.5 68.7 52.5 67.9 50 66.2 C47.5 67.9 42.5 68.7 39.5 64.3 Z" fill={fill} />
          <Path d="M42 63.8 C45.2 62.7 48 63.7 50 65.3 C52 63.7 54.8 62.7 58 63.8" stroke={`url(#${id}hairShine)`} strokeWidth="1.2" opacity={0.45} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'goatee':
      return <Path d="M43.8 74 C46.3 82.8 53.7 82.8 56.2 74 C54.2 79.5 45.8 79.5 43.8 74 Z" fill={fill} opacity={0.92} />;
    case 'soul':
      return <Path d="M47 75 C48.5 73.7 51.5 73.7 53 75 L52.2 81 C51 82.2 49 82.2 47.8 81 Z" fill={fill} opacity={0.9} />;
    case 'full':
      return (
        <G>
          <Path d="M29 58 C30 78 38 88 50 88 C62 88 70 78 71 58 C69 74 61 80 50 80 C39 80 31 74 29 58 Z" fill={fill} opacity={0.94} />
          <Path d="M35 70 C40 80 60 80 65 70" stroke={`url(#${id}hairShine)`} strokeWidth="2" opacity={0.35} fill="none" strokeLinecap="round" />
        </G>
      );
    default:
      return null;
  }
}

function GlassesPart({ style, id }: { style: string; id: string }) {
  const L = 37.6;
  const R = 62.4;
  const Y = 51.8;
  if (style === 'none') return null;
  const frame = style === 'sun' ? '#1F2937' : '#314154';
  const lensFill = style === 'sun' ? '#111827' : `url(#${id}lens)`;
  const lensOpacity = style === 'sun' ? 0.78 : 1;
  if (style === 'round') {
    return (
      <G>
        <Circle cx={L} cy={Y} r="8.4" fill={lensFill} opacity={lensOpacity} stroke={frame} strokeWidth="2.1" />
        <Circle cx={R} cy={Y} r="8.4" fill={lensFill} opacity={lensOpacity} stroke={frame} strokeWidth="2.1" />
        <Path d={`M${L + 8.4} ${Y} C${L + 12} ${Y - 2} ${R - 12} ${Y - 2} ${R - 8.4} ${Y}`} stroke={frame} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Path d={`M${L - 4.5} ${Y - 5.2} L${L + 1.5} ${Y - 8.2} M${R - 4.5} ${Y - 5.2} L${R + 1.5} ${Y - 8.2}`} stroke="#FFFFFF" strokeWidth="1" opacity={0.5} strokeLinecap="round" />
      </G>
    );
  }
  if (style === 'square' || style === 'sun') {
    return (
      <G>
        <Rect x={L - 8.8} y={Y - 6.6} width="17.6" height="13.2" rx="3.8" stroke={frame} strokeWidth="2.1" fill={lensFill} opacity={lensOpacity} />
        <Rect x={R - 8.8} y={Y - 6.6} width="17.6" height="13.2" rx="3.8" stroke={frame} strokeWidth="2.1" fill={lensFill} opacity={lensOpacity} />
        <Path d={`M${L + 8.8} ${Y - 1.6} C${L + 12} ${Y - 3.4} ${R - 12} ${Y - 3.4} ${R - 8.8} ${Y - 1.6}`} stroke={frame} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Path d={`M${L - 5.2} ${Y - 4.3} L${L + 2.4} ${Y - 6.9} M${R - 5.2} ${Y - 4.3} L${R + 2.4} ${Y - 6.9}`} stroke="#FFFFFF" strokeWidth="1" opacity={style === 'sun' ? 0.22 : 0.5} strokeLinecap="round" />
      </G>
    );
  }
  if (style === 'halfrim') {
    return (
      <G>
        <Path d={`M${L - 8.2} ${Y - 0.8} C${L - 8.2} ${Y - 7.4} ${L + 8.2} ${Y - 7.4} ${L + 8.2} ${Y - 0.8}`} stroke={frame} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <Path d={`M${R - 8.2} ${Y - 0.8} C${R - 8.2} ${Y - 7.4} ${R + 8.2} ${Y - 7.4} ${R + 8.2} ${Y - 0.8}`} stroke={frame} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <Path d={`M${L + 8.2} ${Y - 2.4} L${R - 8.2} ${Y - 2.4}`} stroke={frame} strokeWidth="1.8" strokeLinecap="round" />
        <Path d={`M${L - 7.3} ${Y - 0.6} C${L - 3} ${Y + 3} ${L + 3} ${Y + 3} ${L + 7.3} ${Y - 0.6}`} stroke={frame} strokeWidth="0.9" opacity={0.36} fill="none" strokeLinecap="round" />
        <Path d={`M${R - 7.3} ${Y - 0.6} C${R - 3} ${Y + 3} ${R + 3} ${Y + 3} ${R + 7.3} ${Y - 0.6}`} stroke={frame} strokeWidth="0.9" opacity={0.36} fill="none" strokeLinecap="round" />
      </G>
    );
  }
  return (
    <G>
      <Path d={`M${L - 10} ${Y - 5.8} C${L + 1} ${Y - 8.2} ${R - 1} ${Y - 8.2} ${R + 10} ${Y - 5.8} L${R + 7.8} ${Y + 5.4} C${R - 1} ${Y + 7.8} ${L + 1} ${Y + 7.8} ${L - 7.8} ${Y + 5.4} Z`} fill="#2563EB" opacity={0.84} stroke={frame} strokeWidth="1.6" />
      <Path d={`M${L - 5.2} ${Y - 4.2} L${L + 5.8} ${Y - 7.1} M${R - 5.2} ${Y - 4.2} L${R + 5.8} ${Y - 7.1}`} stroke="#FFFFFF" strokeWidth="1.2" opacity={0.42} strokeLinecap="round" />
    </G>
  );
}

function Headwear({ style, color, id }: { style: string; color: string; id: string }) {
  const fill = `url(#${id}hat)`;
  const dark = shade(color, 0.2);
  switch (style) {
    case 'cap':
      return (
        <G>
          <Path d="M22 34 C29 20 42 14 57 17 C69 19 77 27 79 38 C63 32 39 31 22 38 Z" fill={fill} stroke={dark} strokeWidth="0.8" />
          <Path d="M50 34 C66 32 82 35 89 42 C75 40 61 39 49 40 Z" fill={dark} opacity={0.92} />
          <Path d="M31 29 C42 20 58 20 70 30" stroke="#FFFFFF" strokeWidth="2.6" opacity={0.22} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'beanie':
      return (
        <G>
          <Path d="M22 38 C22 22 33 13 50 13 C67 13 78 22 78 38 Z" fill={fill} stroke={dark} strokeWidth="0.8" />
          <Rect x="20" y="35.8" width="60" height="8" rx="4" fill={dark} opacity={0.9} />
          <Path d="M34 20 C42 16 58 16 66 20" stroke="#FFFFFF" strokeWidth="2.2" opacity={0.22} fill="none" strokeLinecap="round" />
          <Path d="M28 36.5 L28 42 M39 36.2 L39 42.4 M50 36 L50 42.5 M61 36.2 L61 42.4 M72 36.5 L72 42" stroke={shade(color, 0.32)} strokeWidth="1" opacity={0.65} />
        </G>
      );
    case 'crown':
      return (
        <G>
          <Path d="M29 31 L35.5 16 L44 26 L50 12 L56 26 L64.5 16 L71 31 C59 27 41 27 29 31 Z" fill="#F7C948" stroke="#C98700" strokeWidth="1" strokeLinejoin="round" />
          <Path d="M33 29 C43 25 57 25 67 29" stroke="#FFF0A8" strokeWidth="2" opacity={0.8} fill="none" strokeLinecap="round" />
          <Circle cx="50" cy="18" r="2" fill="#FFFFFF" opacity={0.7} />
        </G>
      );
    case 'headband':
      return (
        <G>
          <Path d="M20 34 C34 29 66 29 80 34 L79 41 C64 36 36 36 21 41 Z" fill={fill} stroke={dark} strokeWidth="0.8" />
          <Path d="M26 35 C40 31 60 31 74 35" stroke="#FFFFFF" strokeWidth="1.8" opacity={0.25} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'visor':
      return (
        <G>
          <Path d="M24 36 C39 29 61 29 76 36 L76 41 C60 36 40 36 24 41 Z" fill={fill} stroke={dark} strokeWidth="0.8" />
          <Path d="M50 36 C68 34 84 37 90 44 C75 42 61 40 49 41 Z" fill={dark} opacity={0.86} />
          <Path d="M33 34 C44 31 56 31 67 34" stroke="#FFFFFF" strokeWidth="1.9" opacity={0.28} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'party':
      return (
        <G>
          <Path d="M50 5 L65 35 C56 30 44 30 35 35 Z" fill={fill} stroke={dark} strokeWidth="0.8" strokeLinejoin="round" />
          <Circle cx="50" cy="5" r="3.3" fill="#FFFFFF" opacity={0.85} />
          <Circle cx="49" cy="20" r="1.7" fill="#FFFFFF" opacity={0.7} />
          <Circle cx="56" cy="28" r="1.5" fill="#FDE68A" opacity={0.9} />
          <Path d="M44 29 C49 25 55 25 60 29" stroke="#FFFFFF" strokeWidth="1.4" opacity={0.38} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'cowboy':
      return (
        <G>
          <Path d="M16 36 C28 31 72 31 84 36 C86 41 78 44 66 41 C56 39 44 39 34 41 C22 44 14 41 16 36 Z" fill={fill} stroke={dark} strokeWidth="0.9" />
          <Path d="M30 36 C31 23 38 17 50 17 C62 17 69 23 70 36 C58 33 42 33 30 36 Z" fill={fill} stroke={dark} strokeWidth="0.9" />
          <Path d="M32 36 C43 39 57 39 68 36" stroke={dark} strokeWidth="2" opacity={0.78} fill="none" strokeLinecap="round" />
          <Path d="M38 23 C45 19 55 19 62 23" stroke="#FFFFFF" strokeWidth="2" opacity={0.2} fill="none" strokeLinecap="round" />
        </G>
      );
    default:
      return null;
  }
}

// --- color helpers ---
function clampByte(n: number) { return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((x) => clampByte(x).toString(16).padStart(2, '0')).join('')}`;
}
function lighten(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
function shade(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
