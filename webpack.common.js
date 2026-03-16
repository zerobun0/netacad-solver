const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');

module.exports = {
  entry: {
    background: path.resolve('src/background/background.js'),
    content: path.resolve('src/content/content.js'),
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        use: [
          {
            loader: 'source-map-loader',
          },
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          },
        ],
        exclude: /node_modules/,
      },
    ]
  },
  plugins: [
    new CleanWebpackPlugin({verbose: false}),
    new CopyPlugin({
      patterns: [{
        from: path.resolve('src/manifest.json'),
        to: path.resolve('dist'),
        transform: content => {
          return Buffer.from(
            JSON.stringify({
              ...JSON.parse(content.toString()),
              description: process.env.npm_package_description,
              version: process.env.npm_package_version
            })
          );
        }
      }]
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'src/assets/img',
          to: path.join(__dirname, 'dist'),
          force: true,
        },
        {
          from: 'src/popup.html',
          to: path.join(__dirname, 'dist', 'popup.html'),
          force: true,
        },
        {
          from: 'src/popup.js',
          to: path.join(__dirname, 'dist', 'popup.js'),
          force: true,
        },
      ],
    })
  ],
  experiments: {
    topLevelAwait: true
  },
  resolve: {
    extensions: ['.js']
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, 'dist'),
    clean: true,
    publicPath: '',
  },
  devtool: false
};
