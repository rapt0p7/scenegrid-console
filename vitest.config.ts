/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
        pool: 'forks',
        maxWorkers: 1,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: [
                'node_modules/',
                'src/interfaces/',
                'src/config/',
                '**/*.d.ts',
                'src/**/__tests__/**',
                'examples/**'
            ]
        },
        alias: {
            '@infrastructure': path.resolve(__dirname, './src/Infrastructure'),
            '@domain': path.resolve(__dirname, './src/Domain'),
            '@kernel': path.resolve(__dirname, './src/Kernel'),
            '@application': path.resolve(__dirname, './src/Application'),
            '@interfaces': path.resolve(__dirname, './src/interfaces')
        }
    }
});
