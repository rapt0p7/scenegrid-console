/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

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
            rollupTypes: true,
            tsconfigPath: './tsconfig.build.json'
        })
    ]
});
