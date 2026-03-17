import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import webpack from 'webpack';
import { merge } from 'webpack-merge';

import webpackBaseConfig from './webpack.base.config.js';

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default merge(webpackBaseConfig, {
    mode: 'development',
    name: 'development',
    devtool: 'eval-source-map',
    watchOptions: {
        aggregateTimeout: 1000
    },

    plugins: [
        new webpack.DefinePlugin({
            'NODE_ENV': JSON.stringify('development'),
            'process.env.NODE_ENV': JSON.stringify('development')
        })
    ],

    devServer: {
        static: {
            directory: path.join(__dirname, 'public')
        },
        port: '8117',
        host: 'localhost',
        open: true,
        compress: true,
        client: {
            overlay: {
                errors: false,
                warnings: false
            }
        },
        hot: false,
        liveReload: false,
        devMiddleware: {
            mimeTypes: {
                avif: 'image/avif',
                ttf: 'font/ttf',
                webmanifest: 'application/manifest+json'
            }
        },
        historyApiFallback: {
            index: 'index.html'
        }
    }
});
