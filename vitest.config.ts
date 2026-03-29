import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention
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
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '@webaudio-core': path.resolve(__dirname, './src/webaudio-core'),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            '@interfaces': path.resolve(__dirname, './src/interfaces')
        }
    }
});
