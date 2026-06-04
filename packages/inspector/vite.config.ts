/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// oxlint-disable-next-line typescript/ban-ts-comment typescript/prefer-ts-expect-error
// @ts-ignore
import { audioWorkletIsolator } from '../../scripts/vite-worklet-isolator';

const __dirname = import.meta.dirname;

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'ScenegridInspector',
            formats: ['es'],
            fileName: format => `inspector.${format}.js`
        },
        rollupOptions: {
            external: [
                '@scene-grid/shared',
                '@scene-grid/engine',
                'tweakpane',
                '@tweakpane/core',
                '@tweakpane/plugin-essentials'
            ]
        },
        sourcemap: true,
        emptyOutDir: true
    },
    plugins: [
        audioWorkletIsolator(),
        dts({
            rollupTypes: true,
            tsconfigPath: './tsconfig.build.json'
        })
    ]
});
