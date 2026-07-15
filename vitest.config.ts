/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';

import { defineConfig } from 'vitest/config';

// oxlint-disable-next-line no-underscore-dangle
const __filename = import.meta.filename;
// oxlint-disable-next-line no-underscore-dangle
const __dirname = import.meta.dirname;

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.spec.ts'],
        pool: 'forks',
        maxWorkers: 1,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: [
                'node_modules/',
                'packages/*/src/config/',
                '**/*.d.ts',
                'packages/*/src/**/__tests__/**',
                'examples/**'
            ]
        },
        alias: {
            '@scene-grid/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
            '@scene-grid/engine': path.resolve(__dirname, './packages/engine/src/index.ts'),
            '@scene-grid/inspector': path.resolve(__dirname, './packages/inspector/src/index.ts'),

            '@infrastructure': path.resolve(__dirname, './packages/engine/src/Infrastructure'),
            '@domain': path.resolve(__dirname, './packages/engine/src/Domain'),
            '@kernel': path.resolve(__dirname, './packages/engine/src/Kernel'),
            '@application': path.resolve(__dirname, './packages/engine/src/Application')
        }
    }
});
