import { dest, parallel, series, src, watch } from 'gulp'
import plumber from 'gulp-plumber'
import inject from 'gulp-inject'
import postcss from 'gulp-postcss'
import browserSync from 'browser-sync'
import del from 'del'

browserSync.create()

async function init() {
  del.sync(['dist/*', '!dist'])
  browserSync.init({ server: 'dist' })
}

// browserSync to reload the page when the html file in 'dist' changes
async function htmlReload() {
  watch('dist/*.html', { ignoreInitial: false }, async () => {
    browserSync.reload()
  })

  src('node_modules/open-color/open-color.css')
    .pipe(dest('src/css'))
}

async function generalReload() {
  watch(['src/**/*.svg'], { ignoreInitial: false }, async () => {
    browserSync.reload()
  })
}

// when src html files change, inject style tags and move to dist
async function htmlInject() {
  watch('src/*.html', { ignoreInitial: false }, async () => {
    let sources = src(['src/**/*.css'], { read: false })

    src('src/*.html')
      .pipe(plumber())
      .pipe(inject(sources, { relative: true }))
      .pipe(dest('dist'))
  })
}

// browserSync stream any changes in css
async function cssInject() {
  let sources = src(['src/**/*.css'], { read: false })

  watch('src/**/*.css', { ignoreInitial: false }, async () => {
    src('src/**/*.css')
      .pipe(plumber())
      .pipe(postcss([require('autoprefixer')()]))
      .pipe(dest('dist'))
      .pipe(inject(sources, { relative: true }))
      .pipe(browserSync.stream())
  })
}

async function fileCopy() {
  let files = ['src/**/*', '!src/**/*.css', '!src/**/*.html']
  watch(files, { ignoreInitial: false }, async () => {
    src(files)
      .pipe(dest('dist'))
  })
}

exports.serve = series(init, parallel(htmlReload, generalReload, htmlInject, cssInject, fileCopy))
