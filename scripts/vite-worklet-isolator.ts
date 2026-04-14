import fs from 'node:fs';

import { transformWithOxc } from 'vite';

import type { Plugin } from 'vite';

export function audioWorkletIsolator(): Plugin {
    return {
        name: 'scenegrid-worklet-isolator',
        enforce: 'pre',

        async resolveId(source: string, importer: string | undefined) {
            if (source.includes('?worklet')) {
                const cleanPath = source.split('?')[0];
                const resolved = await this.resolve(cleanPath, importer, { skipSelf: true });
                if (resolved) return resolved.id + '?worklet';
            }
            return null;
        },

        async load(id: string) {
            if (id.endsWith('?worklet')) {
                const filePath = id.replace('?worklet', '');
                const rawCode = fs.readFileSync(filePath, 'utf8');

                const result = await transformWithOxc(rawCode, filePath, {
                    target: 'esnext'
                });

                let code = result.code;
                code = code.replaceAll(/export\s*\{\s*\}\s*;/g, '');
                code = code.replaceAll(/^export\s+/gm, '');

                const flatIifeCode = `(function(){\n${code}\n})();`;
                const escapedCode = flatIifeCode
                    .replaceAll('\\', '\\\\')
                    .replaceAll('`', '\\`')
                    .replaceAll('$', String.raw`\$`);

                return `
          const blob = new Blob([\`${escapedCode}\`], { type: 'application/javascript' });
          export default URL.createObjectURL(blob);
        `;
            }
            return null;
        }
    };
}
