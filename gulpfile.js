let { dest, parallel, series, src, watch } = require('gulp')
let plumber = require('gulp-plumber')
let inject = require('gulp-inject')
let postcss = require('gulp-postcss')
let browserSync = require('browser-sync').create()
let del = require('del');

async function init() {
  del.sync(['dist/*', '!dist'])
  browserSync.init({ server: 'dist' })
}

async function i() {
  
  watch('src/*.html', { ignoreInitial: false }, async () => {
    let sources = src(['src/css/*.css'], { read: false })

    src('src/*.html')
      .pipe(plumber())
      .pipe(inject(sources, { relative: true }))
      .pipe(dest('dist'))
  })
}

// browserSync to reload the page when the html file in 'dist' changes
// html file in 'dist' updates from `htmlInject`
async function htmlReload() {
  watch('dist/*.html', { ignoreInitial: false }, async () => {
    browserSync.reload()
  })
}

async function htmlInject() {
  watch('src/*.html', { ignoreInitial: false }, async () => {
  let sources = src(['src/**/*.css'], { read: false })

    src('src/*.html')
      .pipe(plumber())
      .pipe(inject(sources, { relative: true }))
      .pipe(dest('dist'))
  })
}

async function cssInject() {
  let sources = src(['src/**/*.css'], { read: false })

  watch('src/**/*.css', { ignoreInitial: false }, async () => {
    src('src/**/*.css')
      .pipe(plumber())
      .pipe(postcss([ require('autoprefixer')() ]))
      .pipe(dest('dist'))
      .pipe(inject(sources, { relative: true }))
      .pipe(browserSync.stream())
  })
}

exports.serve = series(init, parallel(htmlReload, htmlInject, cssInject))
