// Build-time helper: discover public Giphy IDs for the in-app reaction pack.
// Not shipped with the app, run manually, then paste validated ids into EmoteBar.
const QUERIES = process.argv.slice(2);

const PATTERNS = [
  /giphy\.com\/gifs\/[A-Za-z0-9-]*?([A-Za-z0-9]{13,25})(?:\\?["'\/?])/g,
  /"id":\s*"([A-Za-z0-9]{13,25})"/g,
  /media[0-9]?\.giphy\.com\/media\/([A-Za-z0-9]{6,30})\//g,
  /i\.giphy\.com\/([A-Za-z0-9]{13,25})\./g,
];

async function idsFor(query) {
  const url = `https://giphy.com/search/${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const found = new Set();
  for (const re of PATTERNS) {
    for (const m of html.matchAll(re)) found.add(m[1]);
  }
  return [...found];
}

/** Confirm the keyless media CDN actually serves this id as a gif. */
async function validate(id) {
  const url = `https://media.giphy.com/media/${id}/200w.gif`;
  try {
    const r = await fetch(url, { method: 'GET' });
    const type = r.headers.get('content-type') || '';
    const len = Number(r.headers.get('content-length') || 0);
    return r.status === 200 && type.includes('gif') ? { id, len } : null;
  } catch {
    return null;
  }
}

(async () => {
  for (const q of QUERIES) {
    let ids = [];
    try {
      ids = await idsFor(q);
    } catch (e) {
      console.log(`${q}: fetch error ${e.message}`);
      continue;
    }
    const checked = [];
    for (const id of ids.slice(0, 24)) {
      const ok = await validate(id);
      if (ok) checked.push(ok);
      if (checked.length >= 8) break;
    }
    console.log(`\n=== ${q} === (${ids.length} candidates, ${checked.length} valid)`);
    for (const c of checked) console.log(`  ${c.id}  ${(c.len / 1024).toFixed(0)}KB`);
  }
})();
