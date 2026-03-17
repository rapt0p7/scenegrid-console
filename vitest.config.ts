import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: ['node_modules/', 'src/interfaces/', 'src/config/', '**/*.d.ts']
        },
        alias: {
            '@webaudio-core': path.resolve(__dirname, './src/webaudio-core'),
            '@config': path.resolve(__dirname, './src/config'),
            '@interfaces': path.resolve(__dirname, './src/interfaces')
        }
    }
});
