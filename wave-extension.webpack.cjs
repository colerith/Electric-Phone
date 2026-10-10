const path = require('node:path');
const fs = require('node:fs');
const webpack = require('webpack');
const { VueLoaderPlugin } = require('vue-loader');
const TerserPlugin = require('terser-webpack-plugin');
module.exports = async () => {
  const autoImport = (await import('unplugin-auto-import/webpack')).default;
  const workspace = fs.existsSync(path.join(__dirname, 'src/util/酒馆助手脚本/电波手机'));
  const source = path.join(__dirname, workspace ? 'src/util/酒馆助手脚本/电波手机' : 'tavern-helper/电波手机');
  const bridge = path.join(source, 'extension/bridge.ts');
  const names = [
    'SillyTavern',
    'tavern_events',
    'eventOn',
    'getVariables',
    'replaceVariables',
    'getScriptId',
    'getScriptButtons',
    'replaceScriptButtons',
    'getButtonEvent',
    'createPreset',
    'deletePreset',
    'errorCatched',
    'generate',
    'generateRaw',
    'getCharAvatarPath',
    'getCharData',
    'getCharWorldbookNames',
    'getChatMessages',
    'getTavernRegexes',
    'getWorldbook',
    'getWorldbookNames',
    'injectPrompts',
    'setChatMessages',
    'stopGenerationById',
    'triggerSlash',
    'updateTavernRegexesWith',
  ];
  return {
    mode: 'production',
    target: ['web', 'es2022'],
    devtool: false,
    entry: path.join(source, 'extension/index.ts'),
    output: {
      path: path.join(__dirname, workspace ? 'dist/wave-extension' : 'dist'),
      filename: 'index.js',
      publicPath: '',
      clean: false,
    },
    resolve: {
      extensions: ['.ts', '.js', '.vue', '.json'],
      alias: { vue: require.resolve('vue/dist/vue.runtime.esm-bundler.js') },
    },
    module: {
      rules: [
        { resourceQuery: /raw/, type: 'asset/source' },
        { test: /\.vue$/, loader: 'vue-loader' },
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            onlyCompileBundledFiles: true,
            appendTsSuffixTo: [/\.vue$/],
            configFile: path.join(source, 'extension/tsconfig.json'),
          },
        },
        { test: /\.s[ac]ss$/, use: ['style-loader', { loader: 'css-loader', options: { url: false } }, 'sass-loader'] },
        { test: /\.css$/, use: ['style-loader', { loader: 'css-loader', options: { url: false } }] },
        { test: /\.(png|jpe?g|gif|webp|svg|woff2?|mp3|wav)$/i, type: 'asset/inline' },
      ],
    },
    plugins: [
      new VueLoaderPlugin(),
      autoImport({
        dts: false,
        imports: [
          'vue',
          'pinia',
          '@vueuse/core',
          { from: 'klona', imports: ['klona'] },
          { from: 'dedent', imports: [['default', 'dedent']] },
          { from: 'zod', imports: ['z'] },
        ],
      }),
      new webpack.ProvidePlugin({
        ...Object.fromEntries(names.map(name => [name, [bridge, name]])),
        $: 'jquery',
        _: 'lodash',
        toastr: 'toastr',
      }),
      new webpack.DefinePlugin({
        __WAVE_PHONE_EXTENSION__: true,
        __WAVE_PHONE_MODULE_URL__: 'import.meta.url',
        __VUE_OPTIONS_API__: false,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
      }),
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    ],
    externals: { jquery: 'jQuery', toastr: 'toastr' },
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          extractComments: { condition: /^!|@preserve|@license|@cc_on/i, filename: 'index.js.LICENSE.txt' },
        }),
      ],
    },
    performance: { hints: false },
  };
};
