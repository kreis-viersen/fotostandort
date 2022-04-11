const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const LicensePlugin = require('webpack-license-plugin')
const TerserPlugin = require('terser-webpack-plugin');
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")

const path = require('path');

module.exports = {
  mode: 'production',
  devServer: {
    client: {
      overlay: {
        errors: true,
        warnings: false,
      }
    },
    devMiddleware: {
      stats: 'minimal'
    },
  },
  entry: './src/index.js',
  optimization: {
    minimizer: [new TerserPlugin({
      extractComments: false,
    })],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: ''
  },
  module: {
    rules: [{
      test: /\.css$/i,
      use: ['style-loader', 'css-loader'],
    }, ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{
          from: './LICENSE',
          to: 'fotostandort_license.txt'
        }
      ],
    }),
    new HtmlWebpackPlugin({
      append: true,
      template: path.join(__dirname, 'src/index.html'),
      scriptLoading: 'blocking'
    }),
    new HtmlInlineScriptPlugin(),
    new NodePolyfillPlugin(),
    new LicensePlugin()
  ]
};
