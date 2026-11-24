const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const worker = path.join(root, 'sw.js');
const source = fs.readFileSync(worker, 'utf8');
const section = /^const release = '([^']+)';\r?\nconst integrity = \{\r?\n([\s\S]*?)^\};/m;
const match = section.exec(source);
if (!match) throw new Error('Could not read sw.js release table');
const write = process.argv[2] === '--write';
if (process.argv.length > (write ? 4 : 2)) throw new Error('Use --write <version>, or no arguments to check');
const version = write ? process.argv[3] : match[1].split('-')[0];
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a release version such as 1.4.1');

const digest = (data, encoding) => crypto.createHash('sha256').update(data).digest(encoding);
const files = new Map();
for (const line of match[2].trimEnd().split(/\r?\n/)) {
  const field = /^  '([A-Za-z0-9_.\/-]+)': '[^']*',?$/.exec(line);
  if (!field || field[1].startsWith('/') || field[1].split('/').includes('..') || files.has(field[1])) {
    throw new Error('Invalid sw.js resource entry: ' + line);
  }
  const name = field[1];
  const raw = fs.readFileSync(path.join(root, name));
  const variants = [raw];
  if (/\.(?:html|css|js|svg|webmanifest|json)$/.test(name)) {
    const lf = raw.toString('utf8').replaceAll('\r\n', '\n');
    variants.push(lf, lf.replaceAll('\n', '\r\n'));
  }
  files.set(name, [...new Set(variants.map(data => 'sha256-' + digest(data, 'base64')))].sort().join(' '));
}
const id = version + '-' + digest(JSON.stringify(Object.fromEntries(files)), 'hex').slice(0, 20);
const rows = [...files].map(([name, hash]) => "  '" + name + "': '" + hash + "'");
const newline = source.includes('\r\n') ? '\r\n' : '\n';
const sectionText = ["const release = '" + id + "';", 'const integrity = {', rows.join(',' + newline), '};'].join(newline);
if (sectionText === match[0]) {
  console.log('Current ' + id + ' (' + files.size + ' files)');
} else if (write) {
  fs.writeFileSync(worker, source.slice(0, match.index) + sectionText + source.slice(match.index + match[0].length));
  console.log('Updated ' + id + ' (' + files.size + ' files)');
} else {
  console.error('Release pins differ. Run with --write <version> after finalizing the files.');
  process.exitCode = 1;
}
