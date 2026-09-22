import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { colors } from '../theme/theme';

export interface LineChartProps {
  data: number[];
  width: number;
  height: number;
  color?: string;
}

/** Minimal area/line chart for the stats dashboard (no external chart lib). */
export function LineChart({ data, width, height, color = colors.blue }: LineChartProps) {
  const pad = 8;
  const w = width - pad * 2;
  const h = height - pad * 2;

  if (data.length < 2) {
    return <View style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);

  const pts = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + h - ((v - min) / range) * h;
    return { x, y };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${pad + h} L ${pts[0].x.toFixed(1)} ${pad + h} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0.02} />
        </SvgGradient>
      </Defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <Line key={f} x1={pad} y1={pad + h * f} x2={pad + w} y2={pad + h * f} stroke={colors.border} strokeWidth={1} strokeDasharray="3 4" />
      ))}
      <Path d={areaPath} fill="url(#area)" />
      <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}
