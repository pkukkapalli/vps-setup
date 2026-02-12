#!/usr/bin/env node
/**
 * Bundle run.mjs to CJS for pkg (single executable).
 * Run: node build.mjs
 */
import * as esbuild from 'esbuild';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, 'dist', 'run.cjs');

if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });

await esbuild.build({
  entryPoints: [join(__dirname, 'run.mjs')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  target: 'node18',
  // No banner: pkg adds its own launcher; banner can break pkg's parser
});

console.log('Bundled to', out);
