let path = require('path')
let HtmlWebpackPlugin = require('html-webpack-plugin')
let MiniCssExtractPlugin = require('mini-css-extract-plugin')
let { CleanWebpackPlugin } = require('clean-webpack-plugin')

let dev = process.env.NODE_ENV === 'development'

module.exports = {
  mode: dev ? 'development' : 'production',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          dev ? 'style-loader' : MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              localsConvention: 'camelCaseOnly'
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'src/index.html'
    }),
    ... dev ? [] : [ new MiniCssExtractPlugin() ],
    ... dev ? [] : [ new CleanWebpackPlugin() ]
  ],
  devServer: {
    watchContentBase: true,
    hot: true
  }
}