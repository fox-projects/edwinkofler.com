let { dest, parallel, series, src, watch } = require('gulp');
let plumber = require('gulp-plumber');
let postcss = require('gulp-postcss');
let scss = require('postcss-scss');
let browserSync = require('browser-sync').create();

let postCssPlugins = [
  require('autoprefixer')()
];

async function init() {
  browserSync.init({ server: 'src' });
}

async function htmlReload() {
  watch('samples/*.html', { ignoreInitial: false }, async () => {
    browserSync.reload();
  })
}

async function cssInject() {
  watch('src/**/*.css', { ignoreInitial: false }, async () => {
    src('src/main.css')
      .pipe(plumber())
      .pipe(postcss(postCssPlugins, { syntax: scss }))
      .pipe(dest('dist'))
      .pipe(browserSync.stream());
  })
}

let serve = series(init, parallel(htmlReload, cssInject));

module.exports = {
  serve
};