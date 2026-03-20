import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';

import tsconfig from './tsconfig.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
    mode: 'production',
    devtool: 'source-map',
    target: ['web', 'es2020'],
    experiments: {
        outputModule: true
    },
    entry: './src/index.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        library: {
            type: 'module'
        },
        clean: true
    },

    externals: ['audiomotion-analyzer', 'mitt', 'standardized-audio-context', 'tweakpane', 'worker-timers'],

    resolve: {
        extensions: ['.ts', '.js'],
        plugins: [new TsconfigPathsPlugin()]
    },

    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                minify: TerserPlugin.swcMinify,
                parallel: true,
                terserOptions: {
                    format: { comments: false },
                    compress: { drop_console: true }
                },
                extractComments: false
            })
        ]
    },

    module: {
        rules: [
            {
                test: /\.processor\.ts$/,
                type: 'asset/inline',
                use: [
                    {
                        loader: 'esbuild-loader',
                        options: {
                            loader: 'ts',
                            target: 'es2020'
                        }
                    }
                ]
            },
            {
                test: /\.ts$/,
                exclude: [/node_modules/, /\.processor\.ts$/],
                loader: 'esbuild-loader',
                options: {
                    loader: 'ts',
                    target: 'es2020',
                    tsconfigRaw: tsconfig
                }
            }
        ]
    }
};
