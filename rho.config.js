import path from 'node:path'
import fs from 'node:fs/promises'

import { Temporal } from 'temporal-polyfill'
import TOML from 'smol-toml'

const Filename = new URL(import.meta.url).pathname
const Dirname = path.dirname(Filename)

import { MarkdownItInstance } from './rho.js'
import { validateFrontmatter } from './rho.js'

export const ctx = Object.freeze({
	options: {
		clean: false,
		verbose: false,
	},
	config: {
		buildJsFile: path.join(Dirname, 'rho.js'),
		contentDir: path.join(Dirname, 'content'),
		layoutDir: path.join(Dirname, 'layouts'),
		partialsDir: path.join(Dirname, 'partials'),
		staticDir: path.join(Dirname, 'static'),
		outputDir: path.join(Dirname, 'build'),
		transformOutputUri(/** @type {string} */ uri) {
			if (uri.startsWith('pages/')) {
				uri = uri.slice('pages'.length)
			} else if (uri.startsWith('post/')) {
				uri = uri.slice('posts'.length)
				uri = uri.slice(uri.indexOf('/') + 1)
				uri = `/post/${uri}`
			} else {
				uri = `/${uri}`
			}

			return uri
		},
		async getLayoutContent(/** @type {string} */ inputUri, /** @type {ContentForm} */ contentForm) {
			if (contentForm === 'post') {
				const p = path.join(ctx.config.layoutDir, 'post.hbs')
				return await fs.readFile(p, { encoding: 'utf-8' })
			}

			const p = path.join(ctx.config.layoutDir, 'default.hbs')
			return await fs.readFile(p, { encoding: 'utf-8' })
		}
	},
	handlebarsHelpers: {
		insertStyleTag(/** @type {string} */ inputUri) {
			if (inputUri === 'pages/index.html') {
				return `<link rel="stylesheet" href="/css/home.css" />`
			} else if (inputUri === 'pages/links/links.html') {
				return `<link rel="stylesheet" href="/css/links.css" />`
			} else if (inputUri === 'pages/posts/posts.html') {
				return `<link rel="stylesheet" href="/css/posts.css" />`
			} else {
				return ''
			}
		}
	},
	helpers: {
		getPosts: (...args) => helperGetPosts.call(null, ctx, ...args)
	}
})

async function helperGetPosts(/** @type {Ctx} */ ctx) {
	const posts = []
	for (const year of await fs.readdir(path.join(ctx.config.contentDir, 'post'))) {
		for (const post of await fs.readdir(path.join(ctx.config.contentDir, 'post', year))) {
			const inputFile = await getInputFile(path.join(ctx.config.contentDir, 'post', year, post), post)
			let markdown = await fs.readFile(inputFile, 'utf-8')
			const { html, frontmatter } = (() => {
				let frontmatter = {}
				markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
					frontmatter = TOML.parse(toml)
					return ''
				})

				return {
					html: MarkdownItInstance.render(markdown),
					frontmatter: validateFrontmatter(inputFile, frontmatter, /** @type {ContentForm} */(''))
				}
			})()
			const slug = frontmatter.slug || post
			const date = Temporal.PlainDateTime.from(frontmatter.date.toISOString())
			const dateNice = `${date.year}.${date.month}.${date.day}`
			posts.push({ uri: `${year}/${post}`, frontmatter, slug, dateNice })
		}
	}

	return posts
}

async function getInputFile(/** @type {string} */ dir, /** @type {string} */ dirname) {
	try {
		const htmlFile = path.join(dir, `${dirname}.html`)
		await fs.stat(htmlFile)
		return htmlFile
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}

	try {
		const mdFile = path.join(dir, `${dirname}.md`)
		await fs.stat(mdFile)
		return mdFile
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}

	throw new Error(`No content files (with the correct filename) found in ${dir}`)
}
