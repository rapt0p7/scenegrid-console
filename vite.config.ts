/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';

import { defineConfig } from 'vite';
import { checker } from 'vite-plugin-checker';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { audioWorkletIsolator } from './scripts/vite-worklet-isolator';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

export default defineConfig(({ mode }) => ({
    root: './examples',
    publicDir: 'public',

    plugins: [
        audioWorkletIsolator(),
        checker({
            typescript: true
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
            '@domain': path.resolve(__dirname, 'src/Domain'),
            '@shared': path.resolve(__dirname, 'src/Shared'),
            '@infrastructure': path.resolve(__dirname, 'src/Infrastructure'),
            '@kernel': path.resolve(__dirname, 'src/Kernel'),
            '@application': path.resolve(__dirname, 'src/Application')
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
