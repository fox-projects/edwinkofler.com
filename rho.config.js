import path from 'node:path'
import fs from 'node:fs/promises'

import TOML from 'smol-toml'

const Filename = new URL(import.meta.url).pathname
const Dirname = path.dirname(Filename)

import { MarkdownItInstance } from './rho.js'

/**
 * @typedef {import('./rho.js').Ctx} Ctx
 *
 * @typedef {import('./rho.js').Page} Page
 */

export const ctx = Object.freeze({
	singletons: {
		handlebars: /** @type {typeof import('handlebars')} */ (undefined),
	},
	defaults: /** @type {const} */ ({
		title: 'Edwin Kofler',
		layout: 'default.hbs',
		rootDir: Dirname,
		buildJsFile: path.join(Dirname, 'rho.js'),
		cacheFile: path.join(Dirname, '.cache/cache.json'),
		contentDir: path.join(Dirname, 'content'),
		layoutDir: path.join(Dirname, 'layouts'),
		partialsDir: path.join(Dirname, 'partials'),
		staticDir: path.join(Dirname, 'static'),
		outputDir: path.join(Dirname, 'build'),
	}),
	// These are set in `rho.js`.
	options: {
		command: /** @type {import('./rho.js').Subcommands} */ (undefined),
		clean: /** @type {boolean} */ (undefined),
		verbose: /** @type {boolean} */ (undefined),
		noCache: /** @type {boolean} */ (undefined),
	},
	config: /** @type {const} */ ({
		customUriTransform(/** @type {string} */ uri) {
			if (uri.startsWith('pages/')) {
				uri = uri.slice('pages'.length)
			} else if (uri.startsWith('posts/')) {
				uri = uri.slice('posts/'.length)
				uri = uri.slice(uri.indexOf('/') + 1)
				uri = `/posts/${uri}`
			} else {
				uri = `/${uri}`
			}

			return uri
		},
		async getLayout(/** @type {Ctx} */ ctx, /** @type {Page} */ page) {
			const uri = path.relative(ctx.defaults.contentDir, page.inputFile)

			if (uri.startsWith('posts/')) {
				return 'markdown.hbs'
			}

			return null
		},
		validateFrontmatter(
			/** @type {string} */ inputFile,
			/** @type {Partial<Frontmatter>} */ frontmatter,
		) {
			const uri = path.relative(ctx.defaults.contentDir, inputFile)

			if (uri.startsWith('posts/')) {
				for (const requiredProperty of ['title', 'author', 'date']) {
					if (!(requiredProperty in frontmatter)) {
						throw new Error(
							`Missing required frontmatter property of "${requiredProperty}" in file: ${inputFile}`,
						)
					}
				}
			}

			for (const property in frontmatter) {
				if (
					![
						'title',
						'author',
						'date',
						'layout',
						'slug',
						'categories',
						'tags',
						'draft',
					].includes(property)
				) {
					throw new Error(
						`Invalid frontmatter property of "${property}" in file: ${inputFile}`,
					)
				}
			}

			return /** @type {Frontmatter} */ (frontmatter)
		},
	}),
	handlebarsHelpers: /** @type {const} */ ({
		insertStyleTag(/** @type {string} */ inputUri) {
			if (inputUri === 'content/pages/index.html/index.html') {
				return `<link rel="stylesheet" href="/index.css" />`
			} else if (inputUri === 'content/pages/links/links.html') {
				return `<link rel="stylesheet" href="/links/links.css" />`
			} else if (inputUri === 'content/pages/posts/posts.html') {
				return `<link rel="stylesheet" href="/posts/posts.css" />`
			} else {
				return ''
			}
		},
	}),
	helpers: /** @type {const} */ ({
		getPosts: (...args) => helperGetPosts.call(undefined, ctx, ...args),
	}),
})

async function helperGetPosts(/** @type {Ctx} */ ctx) {
	const posts = []
	for (const year of await fs.readdir(path.join(ctx.defaults.contentDir, 'posts'))) {
		if (year === 'drafts') continue

		for (const post of await fs.readdir(
			path.join(ctx.defaults.contentDir, 'posts', year),
		)) {
			const inputFile = await getInputFile(
				path.join(ctx.defaults.contentDir, 'posts', year, post),
				post,
			)
			let markdown = await fs.readFile(inputFile, 'utf-8')
			const { html, frontmatter } = (() => {
				let frontmatter = {}
				markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
					frontmatter = TOML.parse(toml)
					return ''
				})

				return {
					html: MarkdownItInstance.render(markdown),
					frontmatter: ctx.config.validateFrontmatter(
						inputFile,
						frontmatter,
						/** @type {ContentForm} */ (''),
					),
				}
			})()
			const slug = frontmatter.slug || post
			const date = new Date(frontmatter.date.toISOString())
			const dateNice = `${date.getUTCFullYear()}.${date.getUTCMonth()}.${date.getUTCDay()}`
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
