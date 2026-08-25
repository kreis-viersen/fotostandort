const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const LicensePlugin = require('webpack-license-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const path = require('path');

const maplibrePackageDir = path.dirname(
  require.resolve('maplibre-gl/package.json')
);
const maplibreDistDir = path.join(maplibrePackageDir, 'dist');

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
    publicPath: '',
    clean: true
  },
  module: {
    rules: [{
      test: /\.css$/i,
      use: ['style-loader', 'css-loader'],
    },],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: './LICENSE',
          to: 'fotostandort_license.txt'
        },
        {
          from: './src/assets/icon_fotostandort.png',
          to: 'assets/icon_fotostandort.png'
        },
        {
          from: './src/assets/openCode.svg',
          to: 'assets/openCode.svg'
        },
        {
          from: path.join(maplibreDistDir, 'maplibre-gl-worker.mjs'),
          to: 'maplibre/maplibre-gl-worker.mjs'
        },
        {
          from: path.join(maplibreDistDir, 'maplibre-gl-shared.mjs'),
          to: 'maplibre/maplibre-gl-shared.mjs'
        }
      ],
    }),
    new HtmlWebpackPlugin({
      append: true,
      template: path.join(__dirname, 'src/index.html'),
      scriptLoading: 'blocking'
    }),
    new HtmlInlineScriptPlugin(),
    new LicensePlugin()
  ]
};
