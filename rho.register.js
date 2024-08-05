import module from 'node:module'
import url from 'node:url'

module.register('./rho.hot.js', url.pathToFileURL('./'))
