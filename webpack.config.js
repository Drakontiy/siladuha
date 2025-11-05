const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: './miniapp/src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'miniapp/dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      clean: true,
      publicPath: '/'
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './miniapp/public/index.html',
        filename: 'index.html',
      }),
    ],
    devServer: {
      static: {
        directory: path.join(__dirname, 'miniapp/dist'),
      },
      port: 3000,
      hot: true,
      open: false,
      historyApiFallback: true,
      allowedHosts: 'all', // Разрешаем все хосты для работы через прокси/туннель
      client: {
        webSocketURL: 'auto://0.0.0.0:0/ws'
      }
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
  };
};