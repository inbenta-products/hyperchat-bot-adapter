const webpack = require('webpack');
const resolve = require('path').resolve;

const isProduction = (process.env.INBENV === 'pro');

/**
 * Generate the plugins array for all environments
 * @return {Array} the array of plugins for all environments
 */
const getPlugins = function () {
    const plugins = [
        new webpack.DefinePlugin({
            'process.env': {
                'IS_PRO' : isProduction,
                'VERSION': JSON.stringify(require("./package.json").version),
            }
        })
    ];
    if (isProduction) {
        return addProductionPlugins(plugins);
    }
    return plugins;
};

/**
 * Concat to the shared plugins array all the production plugins that you need
 * @param {Array} pluginsArray the base array containing shared plugins among envs
 * @return {Array} the extended array with production plugins now appended
 */
const addProductionPlugins = function (pluginsArray) {
    return (
        pluginsArray
            .concat(new webpack.optimize.OccurrenceOrderPlugin())
            .concat(new webpack.optimize.UglifyJsPlugin())
        );
};



/** @type {object} Define common configuration for all packages */
const common = {
    devtool: 'source-map',
    output: {
        path: resolve(__dirname, 'dist'),
        libraryTarget: 'umd', // convert to universal module
        publicPath: '/static',
    },
    resolve: {
        root: [ resolve(__dirname, './'), resolve(__dirname, 'node_modules') ]
    },
    plugins: getPlugins(),
}

module.exports = {
    entry: resolve(__dirname, 'lib/', 'index.js'),
    output: {
        path: common.output.path,
        library: 'HCAdapter',
        libraryTarget: common.output.libraryTarget,
        publicPath: common.output.publicPath,
        filename: 'hyperchatbot.js'
    },
    plugins: common.plugins,
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: ['babel-loader']
            }
        ]
    },
};
