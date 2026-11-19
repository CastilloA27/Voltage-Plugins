// Round 18 D4: the docs and the schema agree. Every example theme's theme.json and every JSON snippet in THEMING.md is
// valid against themes/theme.schema.json, and every example theme passes sdk/theme-check.mjs --strict.
//   node tests/theme-docs.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(path.join(root, 'themes', 'theme.schema.json'), 'utf8'));

// the JSON Schema keywords theme.schema.json uses (draft-07 subset); returns a list of problems
function check(s, v, at = '$', out = []) {
  if (s.anyOf) {
    if (!s.anyOf.some((x) => !check(x, v, at).length)) out.push(`${at}: matches none of the allowed forms`);
    return out;
  }
  const types = s.type ? [].concat(s.type) : null;
  const typeOf = (x) => (Array.isArray(x) ? 'array' : x === null ? 'null' : typeof x);
  if (types && !types.some((t) => (t === 'integer' ? Number.isInteger(v) : typeOf(v) === t))) { out.push(`${at}: should be ${types.join(' or ')}`); return out; }
  if (s.enum && !s.enum.includes(v)) out.push(`${at}: ${JSON.stringify(v)} isn't one of ${s.enum.join(', ')}`);
  if (typeof v === 'string') {
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) out.push(`${at}: "${v}" doesn't match ${s.pattern}`);
    if (s.maxLength != null && v.length > s.maxLength) out.push(`${at}: longer than ${s.maxLength}`);
  }
  if (typeof v === 'number') {
    if (s.minimum != null && v < s.minimum) out.push(`${at}: below ${s.minimum}`);
    if (s.maximum != null && v > s.maximum) out.push(`${at}: above ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) out.push(`${at}: fewer than ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) out.push(`${at}: more than ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => check(s.items, x, `${at}[${i}]`, out));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const r of s.required ?? []) if (!(r in v)) out.push(`${at}: "${r}" is required`);
    if (s.maxProperties != null && Object.keys(v).length > s.maxProperties) out.push(`${at}: more than ${s.maxProperties} keys`);
    for (const [k, x] of Object.entries(v)) {
      if (s.propertyNames) check(s.propertyNames, k, `${at} key "${k}"`, out);
      if (s.properties?.[k]) check(s.properties[k], x, `${at}.${k}`, out);
      else if (s.additionalProperties === false) out.push(`${at}: unknown key "${k}"`);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(s.additionalProperties, x, `${at}.${k}`, out);
    }
  }
  return out;
}

// 1. every example theme
const themes = readdirSync(path.join(root, 'themes'), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(path.join(root, 'themes', d.name, 'theme.json'))).map((d) => d.name);
assert.ok(themes.length >= 10, 'the example themes are there');
for (const t of themes) {
  const m = JSON.parse(readFileSync(path.join(root, 'themes', t, 'theme.json'), 'utf8'));
  assert.deepEqual(check(schema, m), [], `themes/${t}/theme.json against the schema`);
  execFileSync(process.execPath, [path.join(root, 'sdk', 'theme-check.mjs'), path.join(root, 'themes', t), '--strict'], { stdio: 'pipe' });
}

// 2. every JSON snippet in THEMING.md: a whole theme.json, a piece of one ("layout": {...}), or one view's layout ("mini": {...})
const doc = readFileSync(path.join(root, 'THEMING.md'), 'utf8').replace(/\r\n/g, '\n');
const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1].trim());
assert.ok(blocks.length >= 4, 'THEMING.md has JSON examples');
const views = Object.keys(schema.properties.layout.properties);
let n = 0;
for (const b of blocks) {
  let v;
  try { v = JSON.parse(b); } catch { v = JSON.parse(`{${b}}`); } // a fragment: "key": value
  const keys = Object.keys(v);
  const doc = keys.every((k) => views.includes(k)) && !keys.includes('id') ? { layout: v } : v;
  const partial = { ...schema, required: [] };
  assert.deepEqual(check(partial, doc), [], `THEMING.md snippet ${b.slice(0, 60)}`);
  n++;
}

// 3. the checker refuses what it should (a quick sanity check of the bundle itself)
assert.throws(() => execFileSync(process.execPath, [path.join(root, 'sdk', 'theme-check.mjs'), path.join(root, 'tests')], { stdio: 'pipe' }), 'a folder without theme.json fails');
console.log(`PASS theme-docs.test.mjs (${themes.length} example themes, ${n} THEMING.md snippets)`);
