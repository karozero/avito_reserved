import { build } from 'esbuild';
import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse((await readFile('manifest.json', 'utf8')).replace(/^\uFEFF/, ''));
manifest.version = pkg.version;
manifest.icons = Object.fromEntries([16, 32, 48, 128].map(size => [size, `icons/icon${size}.png`]));
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { stdio: 'inherit' });
await mkdir('dist/icons', { recursive: true });
await build({ entryPoints: ['src/content.ts'], outfile: 'dist/content.js', bundle: true, format: 'iife', target: 'es2020' });
await copyFile('src/content.css', 'dist/content.css');
for (const size of [16, 32, 48, 128]) {
  await sharp('assets/icon.svg').resize(size, size).png().toFile(`dist/icons/icon${size}.png`);
}
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${pkg.name} ${pkg.version}`);
