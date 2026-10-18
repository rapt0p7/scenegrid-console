import { codecovVitePlugin } from '@codecov/vite-plugin';
/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

void import('dotenv');

// oxlint-disable-next-line no-underscore-dangle
// eslint-disable-next-line no-underscore-dangle
const __dirname = import.meta.dirname;

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'ScenegridShared',
            formats: ['es'],
            fileName: format => `shared.${format}.js`
        },
        sourcemap: true,
        emptyOutDir: true
    },
    plugins: [
        dts({
            tsconfigPath: './tsconfig.build.json'
        }),
        codecovVitePlugin({
            enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
            bundleName: '@scene-grid/shared',
            uploadToken: process.env.CODECOV_TOKEN
        })
    ]
});
