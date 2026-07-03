/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
import { defineConfig } from 'vite';
import { checker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// oxlint-disable-next-line typescript/ban-ts-comment typescript/prefer-ts-expect-error
// @ts-ignore
import { audioWorkletIsolator } from '../scripts/vite-worklet-isolator';

// oxlint-disable-next-line no-underscore-dangle
const __dirname = import.meta.dirname;

// oxlint-disable-next-line max-lines-per-function
export default defineConfig(({ mode }) => ({
    root: './',
    publicDir: 'public',

    plugins: [
        react(),
        tailwindcss(),
        audioWorkletIsolator(),
        checker({
            typescript: {
                buildMode: true
            }
        }),
        viteStaticCopy({
            targets: [
                {
                    src: 'assets/**/*',
                    dest: '/',
                    rename: (_name, _extension, fullPath) => {
                        const index = fullPath.lastIndexOf('assets');
                        const relative = index === -1 ? fullPath : fullPath.slice(index + 'assets'.length);
                        return relative.replace(/^[/\\]/, '');
                    }
                }
            ]
        })
    ],

    resolve: {
        alias: {
            '@scene-grid/inspector': path.resolve(__dirname, '../packages/inspector/src/index.ts'),
            '@scene-grid/engine': path.resolve(__dirname, '../packages/engine/src/index.ts'),
            '@scene-grid/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
            '@domain': path.resolve(__dirname, '../packages/engine/src/Domain'),
            '@infrastructure': path.resolve(__dirname, '../packages/engine/src/Infrastructure'),
            '@kernel': path.resolve(__dirname, '../packages/engine/src/Kernel'),
            '@application': path.resolve(__dirname, '../packages/engine/src/Application')
        }
    },

    define: {
        'NODE_ENV': JSON.stringify(mode),
        'process.env.NODE_ENV': JSON.stringify(mode)
    },

    server: {
        port: 3000,
        host: 'localhost',
        open: true
    },
    build: {
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                inspector: path.resolve(__dirname, 'inspector.html')
            }
        }
    }
}));
