import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import CopyPlugin from 'copy-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import webpack from 'webpack';

import tsconfig from './tsconfig.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export default {
    target: 'browserslist',
    context: path.resolve(__dirname, '.'),
    entry: {
        main: './examples/main.ts'
    },

    output: {
        path: path.resolve(__dirname, 'public'),
        assetModuleFilename: pathData => {
            return `[name][ext]`;
        },
        clean: true,
        filename: () => '[name].js'
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        plugins: [new TsconfigPathsPlugin()],
        fallback: {
            'fs': false,
            'path': false,
            'node:fs': false
        }
    },

    externals: {
        'node:fs': 'commonjs node:fs'
    },

    plugins: [
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, 'examples/index.html'),
            filename: 'index.html',
            inject: 'body',
            chunks: ['main']
        }),
        new ForkTsCheckerWebpackPlugin({
            typescript: {
                configFile: path.resolve(__dirname, 'tsconfig.json'),
                diagnosticOptions: {
                    semantic: true,
                    syntactic: true
                },
                mode: 'write-references'
            }
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: `./examples/assets/**/*`,
                    to({ absoluteFilename }) {
                        const resourceSubDirectory = absoluteFilename
                            .split('assets')
                            .slice(-1)[0]
                            .split(path.sep)
                            .filter(slug => (slug ? !slug.includes('.') : false))
                            .join('/');
                        return `assets/${resourceSubDirectory}/[name][ext]`;
                    },
                    globOptions: {
                        dot: true,
                        gitignore: true,
                        ignore: ['*.woff*', '*.js']
                    }
                }
            ]
        })
    ],

    ignoreWarnings: [/Failed to parse source map/],

    stats: {
        warnings: false
    },

    experiments: {
        cacheUnaffected: true
    },

    module: {
        rules: [
            {
                test: /\.processor\.ts$/,
                type: 'asset/resource',
                use: [
                    {
                        loader: 'esbuild-loader',
                        options: {
                            loader: 'ts',
                            target: 'es2018'
                        }
                    }
                ],
                generator: {
                    filename: 'audio-worklets/[name].[contenthash].js'
                }
            },
            {
                test: /\.(ts|tsx|js|jsx)$/,
                exclude: [/node_modules/, /\.processor\.ts$/],
                loader: 'esbuild-loader',
                options: {
                    loader: 'tsx',
                    target: 'es2022',
                    tsconfigRaw: tsconfig
                }
            }
        ]
    }
};
