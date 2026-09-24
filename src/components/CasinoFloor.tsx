import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient as SvgLinearGradient, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme/theme';

export interface CasinoFloorProps {
  width: number;
  height: number;
}

/**
 * The room the table stands in: a dark patterned casino carpet lit by a row of
 * overhead spots.
 *
 * The backdrop used to be flat black, which read as "nothing rendered here"
 * rather than as a room. Three things fix that: the carpet has a real woven
 * texture, the light falls off from the top of the screen downwards so the table
 * sits in the brightest part of the room, and the beams themselves are visible
 * in the air above it.
 *
 * The weave is the same CC0 Poly Haven cloth photograph used for the felt (see
 * assets/textures/CREDITS.md), tiled smaller and tinted warm so it reads as
 * carpet pile rather than table baize. Beams and pools are SVG gradients, the
 * only way to get a soft-edged cone without shipping a bitmap per screen size.
 */
export function CasinoFloor({ width, height }: CasinoFloorProps) {
  if (width <= 0 || height <= 0) return null;

  // Three spots hung above the table, the middle one directly over it. Each is a
  // cone: narrow at the fitting, spreading as it falls.
  const spots = [
    { x: width * 0.5, spread: 0.46, strength: 1 },
    { x: width * 0.12, spread: 0.3, strength: 0.6 },
    { x: width * 0.88, spread: 0.3, strength: 0.6 },
  ];
  // How far down the beams reach before they are lost in the room.
  const throwY = height * 0.62;

  return (
    <View
      style={[styles.fill, { width, height }]}
      pointerEvents="none"
      // Purely decorative: keep the carpet, beams and vignette out of the
      // accessibility tree so VoiceOver doesn't walk dozens of gradient nodes.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* carpet pile */}
      <Image
        source={require('../../assets/textures/felt-weave.png')}
        style={{ width, height, opacity: 0.55 }}
        resizeMode="repeat"
      />
      <Svg width={width} height={height} style={styles.abs}>
        <Defs>
          {/* warm carpet dye, darkening toward the foreground */}
          <SvgLinearGradient id="carpet" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.floorTop} stopOpacity="1" />
            <Stop offset="0.55" stopColor={colors.floor} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.floorDeep} stopOpacity="1" />
          </SvgLinearGradient>
          {/* a beam is brightest at the fitting and fades as it falls */}
          <SvgLinearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFF6DF" stopOpacity="0.16" />
            <Stop offset="0.45" stopColor="#FFF6DF" stopOpacity="0.07" />
            <Stop offset="1" stopColor="#FFF6DF" stopOpacity="0" />
          </SvgLinearGradient>
          {/* the pool of light where a beam lands */}
          <RadialGradient id="pool" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FFEFD0" stopOpacity="0.2" />
            <Stop offset="0.6" stopColor="#FFEFD0" stopOpacity="0.07" />
            <Stop offset="1" stopColor="#FFEFD0" stopOpacity="0" />
          </RadialGradient>
          {/* corners fall away into the room */}
          <RadialGradient id="vignette" cx="0.5" cy="0.34" r="0.78">
            <Stop offset="0.5" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.72" />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width={width} height={height} fill="url(#carpet)" />

        {spots.map((s, i) => {
          const half = width * s.spread;
          return (
            <React.Fragment key={i}>
              <Ellipse
                cx={s.x}
                cy={throwY * 0.78}
                rx={half}
                ry={half * 0.7}
                fill="url(#pool)"
                opacity={s.strength}
              />
              <Polygon
                points={`${s.x - width * 0.045},0 ${s.x + width * 0.045},0 ${s.x + half},${throwY} ${s.x - half},${throwY}`}
                fill="url(#beam)"
                opacity={s.strength}
              />
            </React.Fragment>
          );
        })}

        <Rect x="0" y="0" width={width} height={height} fill="url(#vignette)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  abs: { position: 'absolute', top: 0, left: 0 },
});
