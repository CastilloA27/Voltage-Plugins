// Rebuilds catalog.json from the plugin folders: every file a plugin ships, with its sha256 (Voltage refuses a download
// whose hash doesn't match). Run after changing any plugin: node build-catalog.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAW = 'https://raw.githubusercontent.com/CastilloA27/Voltage-Plugins/main';
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
fs.writeFileSync(path.join(root, 'catalog.json'), `${JSON.stringify({ version: 1, plugins }, null, 2)}\n`);
console.log(`catalog.json: ${plugins.map((p) => `${p.id} ${p.version}`).join(', ')}`);
