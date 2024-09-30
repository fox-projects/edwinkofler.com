import path from 'node:path'
import fs from 'node:fs/promises'

import TOML from 'smol-toml'

const Filename = new URL(import.meta.url).pathname
const Dirname = path.dirname(Filename)

export const defaults = /** @type {const} */ ({
	title: 'Edwin Kofler',
	layout: 'default.hbs',
	cacheFile: path.join(Dirname, '.cache/cache.json'),
	contentDir: path.join(Dirname, 'content'),
	layoutDir: path.join(Dirname, 'layouts'),
	partialDir: path.join(Dirname, 'partials'),
	staticDir: path.join(Dirname, 'static'),
	outputDir: path.join(Dirname, 'build'),
})

export function transformUri(/** @type {string} */ uri) {
	if (uri.startsWith('pages/')) {
		uri = uri.replace(/^pages\//, '')
	} else if (uri.startsWith('posts/')) {
		uri = uri.replace(/^posts\/(?:.*?\/)?/g, 'posts/')
	}

	// 2018
	uri = uri.replaceAll('hugo-render-latex-with-katex', 'render-latex-with-katex-in-hugo-blog')
	uri = uri.replaceAll('fibonacci-pascal-equation-part-1', 'fibonacci-equation-using-pascals-triangle-part-1')
	uri = uri.replaceAll('fibonacci-pascal-equation-part-2', 'fibonacci-equation-using-pascals-triangle-part-2')

	// 2019
	uri = uri.replaceAll('web-development-years-reflection', 'front-end-web-dev-a-years-reflection')

	// 2020
	uri = uri.replaceAll('fixing-internal-network', 'fixing-my-internal-network')
	uri = uri.replaceAll('fiddling-ubuntu-server-images', 'fiddling-with-ubuntu-server-images')

	// 2022
	uri = uri.replaceAll('expect-terminal-automation', 'terminal-automation-with-expect')

	// drafts
	uri = uri.replaceAll('development-philosophy', 'my-development-philosophy')

	return uri
}

export function getLayout(/** @type {Config} */ config, /** @type {Options} */ options, /** @type {Page} */ page) {
	const uri = path.relative(defaults.contentDir, page.inputFile)

	if (uri.startsWith('posts/')) {
		return 'markdown.hbs'
	}

	return null
}

export function validateFrontmatter(
	/** @type {string} */ inputFile,
	/** @type {Partial<Frontmatter>} */ frontmatter,
) {
	const uri = path.relative(defaults.contentDir, inputFile)

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
}

export const handlebearsHelpers = ({})

export const tenHelpers = {
	async getPosts({ config, options }) {
		const posts = []
		for (const year of await fs.readdir(path.join(defaults.contentDir, 'posts'))) {
			if (year === 'drafts') continue

			for (const post of await fs.readdir(
				path.join(defaults.contentDir, 'posts', year),
			)) {
				const inputFile = await getInputFile(
					path.join(defaults.contentDir, 'posts', year, post),
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
						html: globalThis.MarkdownItInstance.render(markdown),
						frontmatter: config.validateFrontmatter(
							inputFile,
							frontmatter,
							/** @type {ContentForm} */ (''),
						),
					}
				})()
				const slug = path.basename(path.dirname(transformUri(inputFile)))
				const date = new Date(frontmatter.date.toISOString())
				const dateNice = `${date.getUTCFullYear()}.${date.getUTCMonth()}.${date.getUTCDay()}`
				posts.push({ uri: `${year}/${post}`, frontmatter, slug, dateNice })
			}
		}

		return posts
	}
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
