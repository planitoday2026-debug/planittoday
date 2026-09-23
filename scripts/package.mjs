// Source-only ZIP using Node built-ins. Works on Windows, macOS and Linux.
// An allowlist prevents accounts, databases, secrets and machine-specific files from leaking.
import { readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
const folders = ['app', 'components', 'lib', 'server', 'scripts', 'docs', 'tests', 'public', 'vendor'];
const files = ['package.json', 'package-lock.json', 'README.md', '.env.example', '.gitignore', 'index.html', 'main.tsx', 'vite.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'tsconfig.server.json'];
function walk(folder) {
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name); const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error('Do not package symbolic links: ' + path);
    if (name.startsWith('.') || name.endsWith('.log')) continue;
    if (stat.isDirectory()) walk(path); else if (stat.isFile()) files.push(path);
  }
}
folders.forEach(walk);
const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const entries = []; const directory = []; let offset = 0;
for (const path of files.sort()) {
  const name = Buffer.from('planitoday-local/' + path.replaceAll('\\', '/'));
  const content = readFileSync(path); const packed = deflateRawSync(content);
  const crc = crc32(content);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(name.length, 26);
  entries.push(header, name, packed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(33, 14);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
  directory.push(central, name); offset += header.length + name.length + packed.length;
}
const central = Buffer.concat(directory); const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
mkdirSync('releases', { recursive: true });
const destination = resolve('releases/Planitoday-local.zip');
writeFileSync(destination, Buffer.concat([...entries, central, end]));
console.log(`Created ${destination}\n${files.length} source files. No accounts, databases, secrets, or node_modules included.`);
