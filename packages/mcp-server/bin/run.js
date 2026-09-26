#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

const result = spawnSync('npx', ['mcp-use', 'start'], {
    cwd: packageDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
});

process.exit(result.status ?? 1);
