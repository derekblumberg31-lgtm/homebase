import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'public/icons/app-icon.svg');
const outDir = resolve(root, 'public/icons');
const svg = readFileSync(source);

mkdirSync(outDir, { recursive: true });
copyFileSync(source, resolve(outDir, 'favicon.svg'));

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'maskable-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of targets) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(resolve(outDir, name), png);
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}

console.log('App icons generated.');
