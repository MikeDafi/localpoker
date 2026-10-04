import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { GIF_EMOTES } from '../../game/cosmetics';
import { gifUrl } from '../../services/gifs';
import { colors, radii, shadows } from '../../theme/theme';
import type { StorePreviewProps } from './types';

const TABLE_GIF_WIDTH = 96;
const TABLE_GIF_HEIGHT = 72;
const TABLE_GIF_PADDING = 3;
const TABLE_BUBBLE_WIDTH = TABLE_GIF_WIDTH + TABLE_GIF_PADDING * 2;
const TABLE_BUBBLE_HEIGHT = TABLE_GIF_HEIGHT + TABLE_GIF_PADDING * 2;
const TABLE_EMOJI_SIZE = 30;

export function GifPreview({ item, width }: StorePreviewProps) {
  const gif = GIF_EMOTES[item.id];
  const sourceUri = gif ? gifUrl(gif.gifId) : null;
  const fallbackEmoji = item.emoji || '🎞️';
  const previewWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const scale = previewWidth / TABLE_BUBBLE_WIDTH;
  const padding = TABLE_GIF_PADDING * scale;
  const imageWidth = TABLE_GIF_WIDTH * scale;
  const imageHeight = TABLE_GIF_HEIGHT * scale;
  const previewHeight = TABLE_BUBBLE_HEIGHT * scale;
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const imageState = !sourceUri || failedUri === sourceUri ? 'failed' : loadedUri === sourceUri ? 'loaded' : 'loading';

  return (
    <View
      accessible
      accessibilityLabel={`${item.name} GIF preview`}
      style={[styles.wrap, { width: previewWidth, height: previewHeight }]}
    >
      <View
        style={[
          styles.bubble,
          shadows.soft,
          {
            width: previewWidth,
            height: previewHeight,
            padding,
            borderRadius: radii.md * scale,
            maxWidth: 120 * scale,
          },
        ]}
      >
        <View
          style={[
            styles.gifFrame,
            {
              width: imageWidth,
              height: imageHeight,
              borderRadius: radii.sm * scale,
            },
          ]}
        >
          {sourceUri && imageState !== 'failed' ? (
            <Image
              key={sourceUri}
              source={{ uri: sourceUri }}
              style={[styles.gif, imageState === 'loading' && styles.hidden]}
              resizeMode="cover"
              onLoad={() => setLoadedUri(sourceUri)}
              onError={() => setFailedUri(sourceUri)}
            />
          ) : null}
          {imageState === 'loading' ? (
            <View style={styles.status}>
              <ActivityIndicator color={colors.onDarkSoft} size="small" />
            </View>
          ) : null}
          {imageState === 'failed' ? (
            <View style={styles.status}>
              <Text style={[styles.fallbackEmoji, { fontSize: TABLE_EMOJI_SIZE * scale }]}>{fallbackEmoji}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  bubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
  },
  gifFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  gif: { width: '100%', height: '100%' },
  hidden: { opacity: 0 },
  status: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackEmoji: { color: colors.onDark },
});
