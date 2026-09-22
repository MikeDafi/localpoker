import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

const allowPlaceholders = process.argv.includes('--allow-placeholders');
if (allowPlaceholders && process.env.GITHUB_ACTIONS === 'true') {
  console.error('--allow-placeholders is only for local previews and cannot be used in GitHub Actions.');
  process.exit(1);
}

const outDir = resolve(root, readFlag('--out') ?? 'docs/online/_site');
const sourceStoreDir = resolve(root, readFlag('--source-store-dir') ?? 'docs/store');

const siteBase = 'https://mikedafi.github.io/bestplan/';
const pages = [
  {
    source: join(sourceStoreDir, 'PRIVACY-POLICY.md'),
    output: 'privacy/index.html',
    title: 'Privacy Policy',
    description: 'How LocalPoker handles data for play-money poker, online rooms, GIFs, ads, and diagnostics.',
  },
  {
    source: join(sourceStoreDir, 'TERMS.md'),
    output: 'terms/index.html',
    title: 'Terms of Service',
    description: 'The LocalPoker terms for free, play-money Texas Hold\'em entertainment.',
  },
  {
    source: join(sourceStoreDir, 'SUPPORT.md'),
    output: 'support/index.html',
    title: 'Support',
    description: 'Support options for LocalPoker: Poker with Friends.',
  },
];

const placeholderPattern = /\[PLACEHOLDER[^\]\n]*(?:\]|$)|\b[A-Z0-9_]*PLACEHOLDER[A-Z0-9_]*\b/g;

function displayPath(file) {
  const path = relative(root, file);
  return path.startsWith('..') ? file : path;
}

function unresolvedPlaceholders() {
  const findings = [];
  for (const page of pages) {
    const markdown = readFileSync(page.source, 'utf8');
    markdown.split(/\r?\n/).forEach((line, index) => {
      for (const match of line.matchAll(placeholderPattern)) {
        findings.push({
          file: displayPath(page.source),
          line: index + 1,
          marker: match[0],
        });
      }
    });
  }
  return findings;
}

function assertNoPlaceholders() {
  if (allowPlaceholders) return;
  const findings = unresolvedPlaceholders();
  if (!findings.length) return;

  console.error('Refusing to build the public legal site with unresolved placeholders:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}: ${finding.marker}`);
  }
  console.error('Replace these human-owned values before publishing, or use --allow-placeholders only for a local preview.');
  process.exit(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function renderInline(markdown) {
  const code = [];
  let html = markdown.replace(/`([^`]+)`/g, (_, inner) => {
    const token = `@@CODE${code.length}@@`;
    code.push(`<code>${escapeHtml(inner)}</code>`);
    return token;
  });

  html = escapeHtml(html);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const url = href.replaceAll('&amp;', '&');
    return `<a href="${escapeAttribute(url)}">${label}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/@@CODE(\d+)@@/g, (_, index) => code[Number(index)]);
  return html;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let blockquote = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  }

  function flushBlockquote() {
    if (!blockquote.length) return;
    html.push(`<blockquote>${blockquote.map(line => `<p>${renderInline(line)}</p>`).join('')}</blockquote>`);
    blockquote = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushBlockquote();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushBlockquote();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blockquote.push(quote[1]);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      flushBlockquote();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushBlockquote();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    flushList();
    flushBlockquote();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushBlockquote();
  return html.join('\n');
}

function lastUpdated(source) {
  try {
    const value = execFileSync('git', ['log', '-1', '--format=%cs', '--', source], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (value) return value;
  } catch {
    // Git is not required for local previews.
  }
  return new Date().toISOString().slice(0, 10);
}

function renderPage({ title, description, body, updated }) {
  const nav = pages.map(page => `<a href="${siteBase}${page.output.replace(/index\.html$/, '')}">${page.title}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LocalPoker ${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttribute(description)}">
  <style>
    :root { color-scheme: light; --ink: #10202b; --muted: #5f7180; --card: #ffffff; --line: #d8e5ee; --bg: #eef6fb; --blue: #1d6fdc; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: linear-gradient(180deg, #dfeff8 0%, var(--bg) 28rem); line-height: 1.65; }
    .shell { width: min(880px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
    header { margin-bottom: 24px; padding: 28px; border: 1px solid var(--line); border-radius: 24px; background: rgba(255, 255, 255, 0.82); box-shadow: 0 18px 48px rgba(26, 58, 82, 0.12); }
    .brand { margin: 0 0 8px; font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1.05; letter-spacing: -0.04em; }
    .brand span { color: var(--blue); }
    .subtitle { margin: 0; color: var(--muted); font-size: 1.05rem; }
    nav { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
    nav a { display: inline-flex; padding: 9px 13px; border: 1px solid var(--line); border-radius: 999px; color: var(--blue); background: #fff; text-decoration: none; font-weight: 700; }
    main { padding: 28px; border: 1px solid var(--line); border-radius: 24px; background: var(--card); box-shadow: 0 18px 48px rgba(26, 58, 82, 0.10); }
    .updated { margin: 0 0 22px; color: var(--muted); font-size: 0.95rem; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.18; letter-spacing: -0.02em; }
    h1 { margin-top: 0; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    h2 { margin-top: 2.2rem; padding-top: 1.4rem; border-top: 1px solid var(--line); font-size: 1.45rem; }
    h3 { margin-top: 1.8rem; font-size: 1.15rem; }
    a { color: var(--blue); }
    code { padding: 0.15rem 0.3rem; border-radius: 0.35rem; background: #eef5fa; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
    blockquote { margin: 1.2rem 0; padding: 1rem 1.2rem; border-left: 4px solid var(--blue); border-radius: 0.75rem; background: #f5faff; color: #314655; }
    li { margin: 0.35rem 0; }
    footer { margin-top: 18px; color: var(--muted); font-size: 0.92rem; text-align: center; }
    @media (max-width: 620px) { .shell { width: min(100% - 20px, 880px); padding-top: 16px; } header, main { padding: 20px; border-radius: 18px; } nav a { width: 100%; justify-content: center; } }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <p class="brand">Local<span>Poker</span></p>
      <p class="subtitle">${escapeHtml(description)}</p>
      <nav aria-label="Legal pages">${nav}</nav>
    </header>
    <main>
      <p class="updated">Last updated: ${escapeHtml(updated)}</p>
      ${body}
    </main>
    <footer>LocalPoker: Poker with Friends. Free play-money entertainment for adults 18 and older.</footer>
  </div>
</body>
</html>
`;
}

function renderIndex() {
  const cards = pages.map(page => {
    const href = siteBase + page.output.replace(/index\.html$/, '');
    return `<li><a href="${href}">${page.title}</a><span>${escapeHtml(page.description)}</span></li>`;
  }).join('');
  const body = `<h1>LocalPoker legal and support</h1><p>Use these pages for App Store Connect, in-app legal links, and player support.</p><ul class="cards">${cards}</ul>`;
  return renderPage({
    title: 'Legal and Support',
    description: 'Legal and support pages for LocalPoker: Poker with Friends.',
    body,
    updated: new Date().toISOString().slice(0, 10),
  }).replace('</style>', '.cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; } .cards li { padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: #f8fcff; } .cards a { display: block; font-weight: 800; font-size: 1.1rem; } .cards span { display: block; color: var(--muted); margin-top: 4px; }</style>');
}

assertNoPlaceholders();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, '.nojekyll'), '');
writeFileSync(join(outDir, 'index.html'), renderIndex());

for (const page of pages) {
  const markdown = readFileSync(page.source, 'utf8');
  const html = renderPage({
    ...page,
    body: renderMarkdown(markdown),
    updated: lastUpdated(page.source),
  });
  const outputPath = join(outDir, page.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html);
}

console.log(`Built legal site at ${outDir}`);
