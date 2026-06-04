/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
import { defineConfig } from 'vite';
import { checker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// oxlint-disable-next-line typescript/ban-ts-comment typescript/prefer-ts-expect-error
// @ts-ignore
import { audioWorkletIsolator } from '../scripts/vite-worklet-isolator';

const __dirname = import.meta.dirname;

export default defineConfig(({ mode }) => ({
    root: './',
    publicDir: 'public',

    plugins: [
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
                    dest: 'assets',
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
        port: 8117,
        host: 'localhost',
        open: true
    }
}));
