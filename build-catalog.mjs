// Rebuilds catalog.json from the plugin folders: every file a plugin ships, with its sha256 (Voltage refuses a download
// whose hash doesn't match). Run after changing any plugin: node build-catalog.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const RAW = 'https://raw.githubusercontent.com/CastilloA27/Voltage-Plugins/main';

// The signing key is kept encrypted with Windows DPAPI for the current user (catalog-ed25519.pem.dpapi), so a copy of the
// file is useless elsewhere and a plaintext key isn't lying around. A plaintext .pem is converted on first use.
// `node build-catalog.mjs --export-key` prints the PEM once, for an offline backup (password manager / USB stick).
function signingKey() {
  const dir = path.join(os.homedir(), '.voltage-signing');
  const plain = process.env.VOLTAGE_SIGNING_KEY ?? path.join(dir, 'catalog-ed25519.pem');
  const sealed = path.join(dir, 'catalog-ed25519.pem.dpapi');
  const ps = (script, input) => {
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { input, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`DPAPI: ${r.stderr.trim()}`);
    return r.stdout.trim();
  };
  const PREP = "Add-Type -AssemblyName System.Security; $e=[Text.Encoding]::UTF8.GetBytes('voltage-catalog-key');";
  if (!fs.existsSync(sealed) && fs.existsSync(plain)) {
    const pem = fs.readFileSync(plain, 'utf8');
    const blob = ps(`${PREP} $in=[Console]::In.ReadToEnd(); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($in),$e,'CurrentUser'))`, pem);
    fs.writeFileSync(sealed, blob, { mode: 0o600 });
    const back = ps(`${PREP} [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd()),$e,'CurrentUser'))`, blob);
    if (back.trim() !== pem.trim()) throw new Error('DPAPI round trip failed: plaintext key kept');
    fs.rmSync(plain);
    console.log('signing key encrypted with DPAPI (plaintext removed)');
  }
  return ps(`${PREP} [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd()),$e,'CurrentUser'))`, fs.readFileSync(sealed, 'utf8'));
}
if (process.argv.includes('--export-key')) {
  process.stdout.write(`${signingKey()}\n`);
  process.exit(0);
}
const root = path.dirname(fileURLToPath(import.meta.url));
const plugins = [];
for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
  const mf = path.join(root, dir.name, 'plugin.json');
  if (!fs.existsSync(mf)) continue;
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  if (m.id !== dir.name) throw new Error(`${dir.name}: folder name must equal the id (${m.id})`);
  const files = ['plugin.json', m.main].map((name) => ({
    name,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, dir.name, name))).digest('hex'),
  }));
  plugins.push({ id: m.id, name: m.name, version: m.version, author: m.author, description: m.description, base: `${RAW}/${m.id}`, files });
}
const body = `${JSON.stringify({ version: 1, plugins }, null, 2)}\n`;
fs.writeFileSync(path.join(root, 'catalog.json'), body);
// Ed25519 signature over the exact bytes, with the maintainer's offline key (never in this repo). Voltage has the public
// key built in and refuses an official catalog whose signature doesn't verify, so a GitHub account alone can't ship updates.
const sig = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(signingKey()));
fs.writeFileSync(path.join(root, 'catalog.json.sig'), `${sig.toString('base64')}\n`);
console.log(`catalog.json: ${plugins.map((p) => `${p.id} ${p.version}`).join(', ')}`);
