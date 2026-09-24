import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

/**
 * A single global text scale, for the Large Text accessibility setting.
 *
 * Every font size in this app is a literal inside a `StyleSheet.create` block,
 * so there is no theme value to turn up: scaling has to happen where the size
 * is finally read. Patching `Text` once, at the root, is what makes one toggle
 * reach several hundred labels without rewriting any of them.
 *
 * This deliberately scales only `fontSize` and `lineHeight`. Padding, icon
 * sizes and card geometry stay put, so the layout keeps its shape and text
 * grows inside it rather than pushing it around.
 */

/** How much Large Text enlarges type. Enough to matter, small enough to fit. */
export const LARGE_TEXT_SCALE = 1.15;

let currentScale = 1;
let patched = false;

export function getTextScale(): number {
  return currentScale;
}

/**
 * Scale a flattened text style.
 *
 * `lineHeight` has to move with `fontSize` or enlarged text collides with
 * itself: the line box stays at the old height while the glyphs grow.
 */
export function scaleTextStyle(style: TextStyle | undefined, scale: number): TextStyle | undefined {
  if (scale === 1 || !style) return style;
  const next: TextStyle = { ...style };
  if (typeof next.fontSize === 'number') next.fontSize = Math.round(next.fontSize * scale);
  if (typeof next.lineHeight === 'number') next.lineHeight = Math.round(next.lineHeight * scale);
  return next;
}

type Renderable = { props?: { style?: unknown } };

/**
 * Install the patch. Safe to call repeatedly; only the first call takes effect.
 *
 * `Text.render` is the one place every label in the tree passes through,
 * including the ones inside third-party components.
 */
export function installTextScaling(): void {
  if (patched) return;
  patched = true;
  const target = Text as unknown as { render?: (...args: unknown[]) => Renderable };
  const original = target.render;
  if (typeof original !== 'function') return;
  target.render = function patchedRender(this: unknown, ...args: unknown[]) {
    const element = original.apply(this, args) as React.ReactElement<{ style?: unknown }>;
    if (currentScale === 1) return element;
    const flattened = StyleSheet.flatten(element.props.style as TextStyle) as TextStyle | undefined;
    const scaled = scaleTextStyle(flattened, currentScale);
    if (!scaled) return element;
    return React.cloneElement(element, { style: scaled });
  } as typeof target.render;
}

/** Point the scale at the current setting. Returns true when it changed. */
export function setLargeText(enabled: boolean): boolean {
  const next = enabled ? LARGE_TEXT_SCALE : 1;
  if (next === currentScale) return false;
  currentScale = next;
  return true;
}
