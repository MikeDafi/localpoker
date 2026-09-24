/**
 * Stream the running app's console errors and warnings to your terminal.
 *
 * Metro prints JavaScript logs to whichever terminal it was started in, which
 * is no help when that terminal is gone, is someone else's, or is scrolling too
 * fast to read. This attaches to the same inspector the React Native debugger
 * uses and prints only what matters, live, with a running count so a message
 * repeating once per frame is obvious rather than drowning everything else.
 *
 * Useful for faults that only a real finger can produce: XCUITest's synthetic
 * drags are not delivered to react-native-gesture-handler as moving touches, so
 * anything that goes wrong *during* a drag, the peel, in particular, cannot
 * be reproduced from a test and has to be caught while someone actually does
 * it.
 *
 *   node scripts/tail-app-log.mjs            # defaults to Metro on 8095
 *   node scripts/tail-app-log.mjs 8081
 *
 * Open the app first: the inspector only lists a target while it is running.
 * Ctrl-C prints a summary of everything seen, grouped and counted.
 */
import { createRequire } from 'node:module';

const port = process.argv[2] ?? '8095';
const listUrl = `http://localhost:${port}/json/list`;

// Node's built-in WebSocket cannot send the Origin header Metro's inspector
// expects, so this uses `ws`, which ships with the toolchain already.
const require = createRequire(import.meta.url);
let WebSocketImpl;
try {
  WebSocketImpl = require('ws');
} catch {
  console.error('This needs the `ws` package, which should already be in node_modules.');
  process.exit(1);
}

let targets;
try {
  targets = await (await fetch(listUrl)).json();
} catch {
  console.error(`No Metro on port ${port}. Start the app, or pass the right port.`);
  process.exit(1);
}
if (!targets.length) {
  console.error('Metro is running but no app is attached, open the app and try again.');
  process.exit(1);
}

const target = targets[0];
console.log(`attaching to ${target.title}`);

const ws = new WebSocketImpl(target.webSocketDebuggerUrl, {
  headers: { Origin: `http://localhost:${port}` },
});

let id = 0;
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
const counts = new Map();

ws.on('open', () => {
  send('Runtime.enable');
  send('Log.enable');
  console.log('attached, reproduce the problem now, then press Ctrl-C\n');
});

ws.on('error', (e) => console.error('inspector error:', e.message));
ws.on('close', () => console.log('\nthe app disconnected (it may have reloaded or crashed)'));

ws.on('message', (data) => {
  const m = JSON.parse(data);
  let kind = null;
  let text = null;
  if (m.method === 'Runtime.consoleAPICalled') {
    kind = m.params.type;
    text = (m.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
      .join(' ');
  }
  if (m.method === 'Runtime.exceptionThrown') {
    kind = 'exception';
    const d = m.params.exceptionDetails;
    text = d.exception?.description ?? d.text;
  }
  if (!text || (kind !== 'error' && kind !== 'warning' && kind !== 'exception')) return;
  const line = `${kind}: ${text.replace(/\s*\n\s*/g, ' | ')}`;
  const n = (counts.get(line) ?? 0) + 1;
  counts.set(line, n);
  // Only the first few of a repeating message, so one firing every frame cannot
  // bury the rest.
  if (n <= 3) console.log(`[${kind}] ${text.split('\n')[0].slice(0, 220)}`);
  else if (n === 4) console.log(`[${kind}] …repeating, counting quietly`);
});

process.on('SIGINT', () => {
  console.log('\n──── summary ────');
  if (!counts.size) console.log('nothing logged at all.');
  for (const [line, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`x${n}  ${line.slice(0, 300)}`);
  }
  process.exit(0);
});
