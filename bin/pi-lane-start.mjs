#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const tsxImportPath = require.resolve('tsx');
const child = spawn(process.execPath, ['--import', tsxImportPath, cliPath, 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
