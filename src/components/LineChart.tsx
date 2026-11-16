import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from 'react-native-svg';
import { colors, fonts } from '../theme/theme';
import { compactNumber } from '../game/compactNumber';

export interface LineChartProps {
  data: number[];
  width: number;
  height: number;
  color?: string;
  /** Names the vertical axis, e.g. "Chips". */
  yTitle?: string;
  /** Labels for the first and last points along the bottom, e.g. ["40 hands ago", "Latest"]. */
  xEnds?: [string, string];
}

/**
 * Minimal area/line chart for the stats dashboard (no external chart lib).
 *
 * With axes. Without them the stack history was a squiggle: no way to tell
 * whether a drop was 50 chips or 5,000, or whether it spanned five hands or
 * a hundred.
 */
export function LineChart({ data, width, height, color = colors.blue, yTitle, xEnds }: LineChartProps) {
  const left = 38;
  const right = 8;
  const top = yTitle ? 18 : 8;
  const bottom = xEnds ? 20 : 8;
  const w = width - left - right;
  const h = height - top - bottom;

  if (data.length < 2) {
    return <View style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);

  const pts = data.map((v, i) => ({
    x: left + i * stepX,
    y: top + h - ((v - min) / range) * h,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${top + h} L ${pts[0].x.toFixed(1)} ${top + h} Z`;
  // Top, middle and bottom of the range, so both the scale and the swing read.
  const ticks = max === min
    ? [{ y: top + h, value: min }]
    : [0, 0.5, 1].map((f) => ({ y: top + h * f, value: max - range * f }));
  const label = { fill: colors.inkMuted, fontSize: 10, fontFamily: fonts.medium };

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0.02} />
        </SvgGradient>
      </Defs>
      {yTitle ? <SvgText x={0} y={10} {...label} fontFamily={fonts.bold}>{yTitle}</SvgText> : null}
      {ticks.map((t) => (
        <React.Fragment key={t.y}>
          <Line x1={left} y1={t.y} x2={left + w} y2={t.y} stroke={colors.border} strokeWidth={1} strokeDasharray="3 4" />
          <SvgText x={left - 6} y={t.y + 3.5} textAnchor="end" {...label}>{compactNumber(t.value)}</SvgText>
        </React.Fragment>
      ))}
      <Line x1={left} y1={top} x2={left} y2={top + h} stroke={colors.borderStrong} strokeWidth={1} />
      <Line x1={left} y1={top + h} x2={left + w} y2={top + h} stroke={colors.borderStrong} strokeWidth={1} />
      <Path d={areaPath} fill="url(#area)" />
      <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
      {xEnds ? (
        <>
          <SvgText x={left} y={height - 4} {...label}>{xEnds[0]}</SvgText>
          <SvgText x={left + w} y={height - 4} textAnchor="end" {...label}>{xEnds[1]}</SvgText>
        </>
      ) : null}
    </Svg>
  );
}
