import { describe, it, expect } from 'vitest';
import { GIF_LIBRARY, gifUrl, gifThumbUrl } from '../gifs';

describe('gif library', () => {
  it('ships the full curated pack', () => {
    // The whole pack is shown at once in the emote sheet (no search), so it
    // needs to stay big enough to be worth browsing.
    expect(GIF_LIBRARY.length).toBeGreaterThanOrEqual(70);
  });

  it('has no duplicate ids', () => {
    const ids = GIF_LIBRARY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses well-formed giphy ids and keeps tags for intent', () => {
    for (const g of GIF_LIBRARY) {
      expect(g.id).toMatch(/^[A-Za-z0-9]+$/);
      expect(g.tags.length).toBeGreaterThan(0);
    }
  });

  it('covers the reactions a poker player wants', () => {
    const tags = new Set(GIF_LIBRARY.flatMap((g) => g.tags));
    for (const t of ['poker', 'win', 'sad', 'laugh', 'wow', 'tilt', 'money', 'clap', 'facepalm', 'thumbsup', 'goodluck', 'think']) {
      expect(tags.has(t), `missing "${t}" reactions`).toBe(true);
    }
  });

  it('builds keyless Giphy CDN urls, with a tiny static thumbnail', () => {
    expect(gifUrl('abc')).toBe('https://media.giphy.com/media/abc/200w.gif');
    // static rendition keeps the full grid light enough to show every gif
    expect(gifThumbUrl('abc')).toBe('https://media.giphy.com/media/abc/100_s.gif');
  });
});
