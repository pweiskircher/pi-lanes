#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const child = spawn(process.execPath, ['--import', 'tsx', cliPath, 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
