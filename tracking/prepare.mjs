// Prepare offline installer resources. Run npm ci --prefix tracking first.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const destination = resolve(here, '../src-tauri/tracking');
const version = '24.22.3';
const base = `https://nodejs.org/dist/v${version}`;
await mkdir(destination, { recursive: true });

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Node runtime download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
const [binary, hashes, license] = await Promise.all([
  download(`${base}/win-x64/node.exe`),
  download(`${base}/SHASUMS256.txt`),
  download(`https://raw.githubusercontent.com/nodejs/node/v${version}/LICENSE`),
]);
const expected = hashes.toString('utf8').split(/\r?\n/).find(line => line.endsWith('  win-x64/node.exe'))?.split(/\s+/)[0];
const actual = createHash('sha256').update(binary).digest('hex');
if (!expected || expected !== actual) throw new Error('Node runtime checksum verification failed.');
await writeFile(join(destination, 'node.exe'), binary);
await writeFile(join(destination, 'NODE-LICENSE.txt'), license);
await cp(join(here, 'worker.mjs'), join(destination, 'worker.mjs'));
await cp(join(here, 'node_modules'), join(destination, 'node_modules'), { recursive: true, filter: path => basename(path) !== '.bin' });
await readFile(join(destination, 'node_modules/universal-parcel-scraper/package.json'));
console.log(`Prepared free tracking engine with Node ${version} in ${destination}`);
