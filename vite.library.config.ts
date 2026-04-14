/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
// eslint-disable-next-line unicorn/import-style
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

import { audioWorkletIsolator } from './scripts/vite-worklet-isolator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => ({
    root: './',

    plugins: [
        audioWorkletIsolator(),
        dts({
            tsconfigPath: './tsconfig.build.json',
            rollupTypes: true
        })
    ],

    resolve: {
        alias: {
            '@domain': path.resolve(__dirname, 'src/Domain'),
            '@shared': path.resolve(__dirname, 'src/Shared'),
            '@infrastructure': path.resolve(__dirname, 'src/Infrastructure'),
            '@kernel': path.resolve(__dirname, 'src/Kernel'),
            '@application': path.resolve(__dirname, 'src/Application')
        }
    },

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2022',
        minify: true,
        copyPublicDir: false,
        sourcemap: true,

        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'SceneGridAudioEngine',
            formats: ['es', 'umd'],
            fileName: format => `scenegrid-audio.${format}.js`
        },

        rolldownOptions: {
            external: ['mitt', 'worker-timers', 'standardized-audio-context', 'tweakpane'],
            output: {
                globals: {
                    'mitt': 'mitt',
                    'worker-timers': 'workerTimers',
                    'standardized-audio-context': 'standardizedAudioContext',
                    'tweakpane': 'Tweakpane'
                }
            }
        }
    }
}));
