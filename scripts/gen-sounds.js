/*
 * Generates small WAV sound effects into assets/sounds/.
 * Pure Node, no deps. Run: node scripts/gen-sounds.js
 */
const fs = require('fs');
const path = require('path');

const SR = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(OUT, { recursive: true });

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE((s * 32767) | 0, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, name), Buffer.concat([header, data]));
  console.log('wrote', name, (data.length / 1024).toFixed(1) + 'KB');
}

function tone(freq, dur, { type = 'sine', vol = 0.5, decay = 1, sweep = 0 } = {}) {
  const n = Math.floor(SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = freq + sweep * t;
    const ph = 2 * Math.PI * f * t;
    let v;
    if (type === 'square') v = Math.sign(Math.sin(ph));
    else if (type === 'tri') v = (2 / Math.PI) * Math.asin(Math.sin(ph));
    else if (type === 'noise') v = Math.random() * 2 - 1;
    else v = Math.sin(ph);
    const e = Math.pow(1 - t / dur, decay);
    out[i] = v * vol * e;
  }
  return out;
}

function mix(...arrs) {
  const n = Math.max(...arrs.map((a) => a.length));
  const out = new Float32Array(n);
  for (const a of arrs) for (let i = 0; i < a.length; i++) out[i] += a[i];
  return out;
}
function seq(...arrs) {
  const n = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

writeWav('tap.wav', tone(660, 0.08, { type: 'tri', vol: 0.4, decay: 2 }));
writeWav('select.wav', seq(tone(520, 0.05, { type: 'tri', vol: 0.35, decay: 2 }), tone(720, 0.06, { type: 'tri', vol: 0.35, decay: 2 })));
writeWav('deal.wav', mix(tone(1200, 0.06, { type: 'noise', vol: 0.18, decay: 3 }), tone(300, 0.05, { type: 'tri', vol: 0.2, decay: 3 })));
writeWav('chip.wav', mix(tone(2000, 0.05, { type: 'noise', vol: 0.15, decay: 4 }), tone(900, 0.06, { type: 'square', vol: 0.12, decay: 3 })));
writeWav('check.wav', tone(400, 0.09, { type: 'tri', vol: 0.35, decay: 2 }));
writeWav('fold.wav', tone(240, 0.16, { type: 'tri', vol: 0.35, decay: 1.5, sweep: -300 }));
writeWav('turn.wav', seq(tone(880, 0.09, { type: 'sine', vol: 0.3, decay: 2 }), tone(1180, 0.09, { type: 'sine', vol: 0.3, decay: 2 })));
writeWav('coins.wav', seq(
  tone(900, 0.05, { type: 'tri', vol: 0.3, decay: 2 }),
  tone(1200, 0.05, { type: 'tri', vol: 0.3, decay: 2 }),
  tone(1500, 0.07, { type: 'tri', vol: 0.3, decay: 2 }),
));
writeWav('win.wav', seq(
  tone(523, 0.1, { type: 'tri', vol: 0.35, decay: 1.5 }),
  tone(659, 0.1, { type: 'tri', vol: 0.35, decay: 1.5 }),
  tone(784, 0.1, { type: 'tri', vol: 0.35, decay: 1.5 }),
  tone(1047, 0.22, { type: 'tri', vol: 0.4, decay: 1.2 }),
));
writeWav('lose.wav', seq(
  tone(440, 0.13, { type: 'tri', vol: 0.3, decay: 1.5 }),
  tone(349, 0.13, { type: 'tri', vol: 0.3, decay: 1.5 }),
  tone(262, 0.26, { type: 'tri', vol: 0.32, decay: 1.2 }),
));
writeWav('error.wav', seq(tone(200, 0.1, { type: 'square', vol: 0.25, decay: 2 }), tone(160, 0.12, { type: 'square', vol: 0.25, decay: 2 })));
writeWav('start.wav', seq(
  tone(392, 0.08, { type: 'tri', vol: 0.3, decay: 2 }),
  tone(523, 0.08, { type: 'tri', vol: 0.3, decay: 2 }),
  tone(784, 0.14, { type: 'tri', vol: 0.35, decay: 1.5 }),
));
console.log('done');

// Countdown tick + urgent tick (appended)
writeWav('tick.wav', tone(1000, 0.05, { type: 'tri', vol: 0.28, decay: 3 }));
writeWav('tickUrgent.wav', tone(1500, 0.06, { type: 'square', vol: 0.3, decay: 3 }));
