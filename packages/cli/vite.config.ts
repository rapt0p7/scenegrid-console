import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(import.meta.dirname, 'src/index.ts'),
            name: 'ScenegridCLI',
            formats: ['es'],
            fileName: format => `cli.${format}.js`
        },
        rolldownOptions: {
            external: [
                /node_modules/,
                /^node:/,
                '@scene-grid/shared',
                '@scene-grid/engine',
                'execa',
                'commander',
                'zod',
                'cosmiconfig',
                'p-limit'
            ]
        },
        sourcemap: true,
        emptyOutDir: true
    },
    plugins: [
        dts({
            tsconfigPath: './tsconfig.build.json'
        })
    ]
});
