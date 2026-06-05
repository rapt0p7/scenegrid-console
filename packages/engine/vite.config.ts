/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// oxlint-disable-next-line typescript/ban-ts-comment typescript/prefer-ts-expect-error
// @ts-ignore
import { audioWorkletIsolator } from '../../scripts/vite-worklet-isolator';

// oxlint-disable-next-line no-underscore-dangle
const __dirname = import.meta.dirname;

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'ScenegridEngine',
            formats: ['es'],
            fileName: format => `engine.${format}.js`
        },
        rollupOptions: {
            external: ['@scene-grid/shared', 'standardized-audio-context', 'mitt', 'worker-timers', 'globalthis']
        },
        sourcemap: true,
        emptyOutDir: true
    },
    plugins: [
        audioWorkletIsolator(),
        dts({
            tsconfigPath: './tsconfig.build.json'
        })
    ],
    resolve: {
        alias: {
            '@domain': path.resolve(__dirname, 'src/Domain'),
            '@infrastructure': path.resolve(__dirname, 'src/Infrastructure'),
            '@kernel': path.resolve(__dirname, 'src/Kernel'),
            '@application': path.resolve(__dirname, 'src/Application')
        }
    }
});
