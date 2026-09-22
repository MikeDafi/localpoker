/**
 * Curated, key-free GIF reaction pack.
 *
 * Giphy's media CDN serves GIFs without an API key, so this pack needs no
 * credentials and no network API — the whole thing is shown in the emote sheet.
 * Tags are kept for grouping/intent, not for a search box.
 *
 * Pure module (no React Native imports) so the catalog stays unit-testable.
 * Every id here is checked against the CDN by scripts/find-gifs.mjs.
 */

export const gifUrl = (id: string) => `https://media.giphy.com/media/${id}/200w.gif`;
/** Tiny static preview (~6KB) so the whole pack can be shown at once. */
export const gifThumbUrl = (id: string) => `https://media.giphy.com/media/${id}/100_s.gif`;

/** The full curated reaction pack, shown all at once in the emote sheet. */
export const GIF_LIBRARY: { id: string; tags: string[] }[] = [
  // poker
  { id: 'xT9DPi61MmrDLzVFzq', tags: ['poker', 'cards', 'allin', 'bet'] },
  { id: 'l0MYv61yrzZu6roFG', tags: ['poker', 'cards', 'deal', 'chips'] },
  { id: 'YFH1JUdAdtNkf0kmFL', tags: ['poker', 'cards', 'bluff'] },
  { id: 'SsaY6eIIKSJJtPEh6B', tags: ['poker', 'cards', 'allin', 'shove'] },
  { id: '32ZVeWGbvP1d5rtJS8', tags: ['poker', 'cards', 'bluff', 'stare'] },
  { id: '1hAZilMTyFwYuX847H', tags: ['poker', 'cards', 'chips'] },
  // winning / celebration
  { id: 'l0MYt5jPR6QX5pnqM', tags: ['win', 'celebrate', 'happy', 'party', 'yes', 'gg'] },
  { id: 'vmon3eAOp1WfK', tags: ['win', 'celebrate', 'happy', 'yes'] },
  { id: 'lMameLIF8voLu8HxWV', tags: ['win', 'celebrate', 'party', 'dance'] },
  { id: '6JzM6pW8Sa8loWxBmt', tags: ['win', 'celebrate', 'happy', 'yes'] },
  { id: 'qsFzSSvxTYfPgDy5Ek', tags: ['win', 'celebrate', 'party'] },
  { id: 'xT8qAY7e9If38xkrIY', tags: ['win', 'celebrate', 'happy', 'gg'] },
  // losing / sad
  { id: 'd2lcHJTG5Tscg', tags: ['sad', 'cry', 'lose', 'unlucky'] },
  { id: '2WxWfiavndgcM', tags: ['sad', 'cry', 'lose', 'badbeat'] },
  { id: 'P53TSsopKicrm', tags: ['sad', 'cry', 'lose'] },
  { id: 'qQdL532ZANbjy', tags: ['sad', 'cry', 'unlucky', 'badbeat'] },
  { id: 'djFqPPIbvzuVHKW53V', tags: ['sad', 'cry', 'lose'] },
  { id: 'G6IATw3N0jhIc', tags: ['sad', 'cry', 'unlucky'] },
  // laughing
  { id: 'XHeLeuirRbwptHhSWd', tags: ['laugh', 'lol', 'funny', 'haha'] },
  { id: 'aqqUwXz7j0xMOKnJgb', tags: ['laugh', 'lol', 'funny'] },
  { id: '61FBkpCzVtv9vLETx1', tags: ['laugh', 'lol', 'haha'] },
  { id: 'XBCJIv6xAyDfrajXoe', tags: ['laugh', 'funny', 'haha'] },
  { id: 'DGgypYq1ruMza7UQZj', tags: ['laugh', 'lol', 'funny'] },
  // shocked / wow
  { id: '26ufdipQqU2lhNA4g', tags: ['shocked', 'wow', 'omg', 'mindblown'] },
  { id: 'bGPTxLislwm3u', tags: ['shocked', 'wow', 'omg', 'surprised'] },
  { id: '0tONCfOdU9SW4YTtCk', tags: ['shocked', 'surprised', 'omg'] },
  { id: 'qgRH26FMBoEzm', tags: ['shocked', 'wow', 'surprised'] },
  { id: 'tu54GM19sqJOw', tags: ['shocked', 'omg', 'surprised'] },
  { id: '4VUgpQ9FiYEBCA9wM1', tags: ['shocked', 'wow', 'mindblown'] },
  { id: '5VKbvrjxpVJCM', tags: ['wow', 'shocked', 'amazing'] },
  { id: 'ep78UZy5FVbfN6mhCU', tags: ['wow', 'surprised', 'omg'] },
  { id: 'QXPmPdudTz4So2P4OQ', tags: ['wow', 'amazing', 'shocked'] },
  { id: 'SsYyZcduMD9BprMPEO', tags: ['wow', 'surprised'] },
  // angry / tilt
  { id: '11tTNkNy1SdXGg', tags: ['angry', 'mad', 'tilt', 'rage'] },
  { id: 'TGi1zmIHpDRsrxtoPq', tags: ['angry', 'mad', 'tilt'] },
  { id: 'ZebTmyvw85gnm', tags: ['angry', 'rage', 'mad'] },
  { id: 'CyYz3SIvUEqXZtJ4d0', tags: ['angry', 'tilt', 'mad'] },
  { id: 'hJUHoFaWf4MTSTuKmK', tags: ['angry', 'rage', 'tilt'] },
  { id: 'm8fyrgnXwXV5EHw6Lm', tags: ['angry', 'mad', 'rage'] },
  // thinking / tanking
  { id: 'd3mlE7uhX8KFgEmY', tags: ['think', 'thinking', 'hmm', 'decide'] },
  { id: '2H67VmB5UEBmU', tags: ['think', 'thinking', 'hmm'] },
  { id: '3etP8HqLPVixUc9Y3s', tags: ['think', 'thinking', 'tank', 'decide'] },
  { id: 'TPl5N4Ci49ZQY', tags: ['think', 'hmm', 'suspicious'] },
  { id: '3oKIPl97G9KsnxS3XG', tags: ['think', 'thinking', 'tank'] },
  { id: 'Lmq2eMv7gqVHC33Suc', tags: ['think', 'hmm', 'decide'] },
  { id: 'a5viI92PAF89q', tags: ['think', 'thinking', 'suspicious'] },
  // money / chips
  { id: 'MFsqcBSoOKPbjtmvWz', tags: ['money', 'cash', 'rich', 'chips'] },
  { id: 'LCdPNT81vlv3y', tags: ['money', 'cash', 'rich'] },
  { id: 'ESt8At0PXpmj6', tags: ['money', 'cash', 'stack'] },
  { id: 'o56hISbxCRipgSrIB0', tags: ['money', 'rich', 'stack'] },
  { id: 'JpG2A9P3dPHXaTYrwu', tags: ['money', 'cash', 'chips'] },
  { id: 'h0MTqLyvgG0Ss', tags: ['money', 'rich', 'cash'] },
  // clapping / nice hand
  { id: 'YRuFixSNWFVcXaxpmX', tags: ['clap', 'applause', 'nice', 'respect'] },
  { id: '11OOAQSnUaZT2M', tags: ['clap', 'applause', 'nice'] },
  { id: '4PXUYM1bXS3lRXO7lX', tags: ['clap', 'applause', 'wp'] },
  { id: 'fnK0jeA8vIh2QLq3IZ', tags: ['clap', 'nice', 'respect'] },
  { id: 'WIYZgpkUwB8DRtFCZX', tags: ['clap', 'applause', 'wp'] },
  { id: 'lMBcCPM0VYfhh2zCAy', tags: ['clap', 'nice'] },
  { id: '1236TCtX5dsGEo', tags: ['clap', 'applause'] },
  // facepalm / oops
  { id: 'XD4qHZpkyUFfq', tags: ['facepalm', 'oops', 'ugh', 'mistake'] },
  { id: '6yRVg0HWzgS88', tags: ['facepalm', 'oops', 'ugh'] },
  { id: '113RhN1oBm1yCc', tags: ['facepalm', 'mistake', 'oops'] },
  { id: 'eH2uOQEmvcqcqgPoH3', tags: ['facepalm', 'ugh', 'mistake'] },
  { id: 'e5uyWolyR0y30Wo1ya', tags: ['facepalm', 'oops'] },
  { id: 'WrNfErHio7ZAc', tags: ['facepalm', 'ugh'] },
  // thumbs up / agree
  { id: '111ebonMs90YLu', tags: ['thumbsup', 'ok', 'good', 'agree'] },
  { id: '9Ai5dIk8xvBm0', tags: ['thumbsup', 'ok', 'nice'] },
  { id: 'Q66ZEIpjEQddUOOKGW', tags: ['thumbsup', 'good', 'agree'] },
  { id: 'XdUMQuuiaAEkOUtezd', tags: ['thumbsup', 'ok', 'gg'] },
  { id: '5MzzMebtfoTdwZJPd7', tags: ['thumbsup', 'nice', 'good'] },
  { id: 'SShJcu4ySty1G6MX9A', tags: ['thumbsup', 'ok'] },
  { id: '3o7abKhOpu0NwenH3O', tags: ['thumbsup', 'agree', 'good'] },
  { id: 'h9TQwUxEla2nias5mi', tags: ['thumbsup', 'nice', 'gg'] },
  // good luck
  { id: '12XDYvMJNcmLgQ', tags: ['goodluck', 'gl', 'luck', 'cheers'] },
  { id: 'pDgHg2Lcju3Ty', tags: ['goodluck', 'gl', 'luck'] },
  { id: 'tCxHdMIX3OD8KyNtjx', tags: ['goodluck', 'luck', 'cheers'] },
  { id: 'ospuJEQqZEIFd2QDaq', tags: ['goodluck', 'gl', 'luck'] },
  { id: 'kVaj8JXJcDsqs', tags: ['goodluck', 'cheers', 'luck'] },
  { id: 'UKWxGMEPjRwCA', tags: ['goodluck', 'gl', 'cheers'] },
];
