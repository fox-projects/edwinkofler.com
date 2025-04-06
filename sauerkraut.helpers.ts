import path from 'node:path'
import fs from 'node:fs'
import TOML from 'smol-toml'
import type { Config, Options } from 'sauerkraut'

export async function getPosts({
	config,
	options,
}: {
	config: Config
	options: Options
}) {
	const posts = []
	for (const year of await fs.readdir(path.join(config.contentDir, 'posts'))) {
		if (year === 'drafts') continue

		for (const post of await fs.readdir(path.join(config.contentDir, 'posts', year))) {
			const inputFile = await getInputFile(
				path.join(config.contentDir, 'posts', year, post),
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
						config,
						inputFile,
						frontmatter,
						/** @type {ContentForm} */ '',
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

async function getInputFile(dir: string, dirname: string) {
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
