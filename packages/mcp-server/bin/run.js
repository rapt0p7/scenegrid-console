#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const mcpUsePkgPath = require.resolve('mcp-use/package.json');
const mcpUseDir = dirname(mcpUsePkgPath);
const mcpUseBin = join(mcpUseDir, require(mcpUsePkgPath).bin['mcp-use']);

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

const result = spawnSync(process.execPath, [mcpUseBin, 'start'], {
    cwd: packageDir,
    stdio: 'inherit'
});

process.exit(result.status ?? 1);
