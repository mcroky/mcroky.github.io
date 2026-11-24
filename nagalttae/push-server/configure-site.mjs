import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const api = new URL(process.argv[2]);
if (!/^https:\/\/nagalttae-push\.[a-z0-9-]+\.workers\.dev\/$/.test(api.href)) {
  throw new Error('Pass the dedicated HTTPS workers.dev address printed by wrangler deploy.');
}
const origin = 'https://mcroky.github.io';
const keyResponse = await fetch(new URL('/key', api), { headers: { Origin: origin }, redirect: 'error', signal: AbortSignal.timeout(10000) });
if (!keyResponse.ok || keyResponse.headers.get('Access-Control-Allow-Origin') !== origin ||
    !/^B[\w-]{86}$/.test((await keyResponse.json()).publicKey)) throw new Error('Public key or allowed origin check failed.');
const html = new URL('../index.html', import.meta.url);
const source = await readFile(html, 'utf8');
const meta = /<meta name="nagal-push-api" content="[^"]*">/g;
if ([...source.matchAll(meta)].length !== 1) throw new Error('Expected exactly one push service setting.');
const version = /const release = '(\d+\.\d+\.\d+)'/.exec(await readFile(new URL('../studio.js', import.meta.url), 'utf8'))[1];
await writeFile(html, source.replace(meta, '<meta name="nagal-push-api" content="' + api.origin + '">'));
execFileSync(process.execPath, [fileURLToPath(new URL('../verification/refresh-offline-shell.cjs', import.meta.url)), '--write', version], { stdio: 'inherit' });
console.log('Prepared the web app for ' + api.origin);
