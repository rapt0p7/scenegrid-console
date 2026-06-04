const path = require('node:path');

module.exports = {
    resolve: {
        alias: {
            '@scene-grid/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
            '@domain': path.resolve(__dirname, 'packages/engine/src/Domain'),
            '@infrastructure': path.resolve(__dirname, 'packages/engine/src/Infrastructure'),
            '@kernel': path.resolve(__dirname, 'packages/engine/src/Kernel'),
            '@application': path.resolve(__dirname, 'packages/engine/src/Application')
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
    }
};
