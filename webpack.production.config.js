const path = require('path');
const webpack = require('webpack');
const { merge } = require('webpack-merge');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const JsonMinimizerPlugin = require('json-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const threadLoader = require('thread-loader');
const HtmlMinimizerPlugin = require('html-minimizer-webpack-plugin');
const webpackBaseConfig = require('./webpack.base.config');

require('dotenv').config();

threadLoader.warmup(
    {
        workers: require('os').cpus().length - 1,
        parallel: true
    },
    ['babel-loader']
);

module.exports = merge(webpackBaseConfig, {
    mode: 'production',
    name: 'production',
    devtool: 'hidden-source-map',
    output: {
        assetModuleFilename: () => {
            return `[name]-[contenthash][ext]`;
        },
        filename: () => '[name]-[contenthash].js'
    },
    optimization: {
        minimize: true,
        minimizer: [
            new HtmlMinimizerPlugin({
                minify: HtmlMinimizerPlugin.swcMinify,
                minimizerOptions: {}
            }),
            new TerserPlugin({
                minify: TerserPlugin.swcMinify,
                test: /\.js(\?.*)?$/i,
                parallel: true,
                extractComments: false,
                terserOptions: {
                    format: {
                        comments: false
                    },
                    compress: {
                        drop_console: true
                    }
                }
            }),
            new JsonMinimizerPlugin()
        ]
    },
    plugins: [
        new CleanWebpackPlugin(),
        new webpack.DefinePlugin({
            'NODE_ENV': JSON.stringify('production'),
            'process.env.NODE_ENV': JSON.stringify('production')
        })
    ]
});
