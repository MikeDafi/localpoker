// Pulls official store screenshots for reference games from Steam's public
// appdetails API (structured + authoritative, unlike scraping image search).
import fs from 'node:fs';
import path from 'node:path';

const UA = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' };
const OUT = path.resolve('docs/research/table-refs');

const GAMES = [
  { slug: 'prominence-poker', appid: 384180 },
  { slug: 'poker-club', appid: 1174460 },
  { slug: 'pure-holdem', appid: 322950 },
];

function dims(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  for (const g of GAMES) {
    const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${g.appid}&l=en`, { headers: UA });
    const j = await r.json();
    const d = j[g.appid]?.data;
    if (!d) { console.log('FAIL meta', g.slug); continue; }
    const shots = (d.screenshots || []).slice(0, 6);
    console.log(`\n${d.name}  (${d.developers?.join(', ')}, ${d.release_date?.date}), ${shots.length} shots`);
    for (const [i, s] of shots.entries()) {
      try {
        const res = await fetch(s.path_full, { headers: UA });
        const buf = Buffer.from(await res.arrayBuffer());
        const dim = dims(buf);
        const file = `${g.slug}-${i}.jpg`;
        fs.writeFileSync(path.join(OUT, file), buf);
        manifest.push({
          slug: g.slug, appid: g.appid, index: i, file,
          game: d.name,
          developer: (d.developers || []).join(', '),
          released: d.release_date?.date || '',
          width: dim?.w, height: dim?.h, bytes: buf.length,
          source: s.path_full,
          store: `https://store.steampowered.com/app/${g.appid}/`,
        });
        console.log(`  ${file}  ${dim?.w}x${dim?.h}  ${(buf.length / 1024).toFixed(0)}KB`);
      } catch (e) { console.log('  skip', i, e.message); }
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nsaved ${manifest.length} candidate shots -> ${OUT}`);
})();
