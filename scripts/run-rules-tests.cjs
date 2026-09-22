const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const firebaseBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase');

const java = spawnSync('java', ['-version'], { encoding: 'utf8' });
if (java.error && java.error.code === 'ENOENT') {
  console.log('Skipping Firebase rules tests: Java is not installed, so the Realtime Database emulator cannot start.');
  process.exit(0);
}

if (!fs.existsSync(firebaseBin)) {
  console.log('Skipping Firebase rules tests: firebase-tools is not installed. Run npm install first.');
  process.exit(0);
}

const result = spawnSync(
  firebaseBin,
  [
    'emulators:exec',
    '--config',
    'firebase.rules-test.json',
    '--project',
    'demo-localpoker',
    '--only',
    'database',
    'node scripts/rules-unit-check.cjs',
  ],
  { cwd: root, stdio: 'inherit' },
);

for (const logFile of ['database-debug.log', 'firebase-debug.log', 'ui-debug.log']) {
  const logPath = path.join(root, logFile);
  if (fs.existsSync(logPath)) {
    fs.rmSync(logPath, { force: true });
  }
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
