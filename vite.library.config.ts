/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

import { audioWorkletIsolator } from './scripts/vite-worklet-isolator';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

// oxlint-disable-next-line max-lines-per-function, no-unused-vars, typescript/prefer-readonly-parameter-types
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
            entry: {
                index: path.resolve(__dirname, 'src/index.ts'),
                debug: path.resolve(__dirname, 'src/debug.ts')
            },
            name: 'SceneGridAudioEngine',
            formats: ['es'],
            fileName: (format, entryName) => `scenegrid-audio.${entryName}.${format}.js`
        },

        rolldownOptions: {
            external: [
                'mitt',
                'worker-timers',
                'standardized-audio-context',
                'tweakpane',
                '@tweakpane/plugin-essentials'
            ],
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
