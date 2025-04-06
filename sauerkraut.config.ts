import path from 'node:path'
import fs from 'node:fs/promises'
import type { Config, LayoutData, Frontmatter } from 'sauerkraut'

export const title = 'Edwin Kofler'

export function transformUri(config: Config, uri: string) {
	if (uri.startsWith('pages/')) {
		uri = uri.replace(/^pages\//, '')
	} else if (uri.startsWith('posts/')) {
		uri = uri.replace(/^posts\/(?:.*?\/)?/g, 'posts/')
	}

	// 2018
	uri = uri.replaceAll(
		'/hugo-render-latex-with-katex',
		'/render-latex-with-katex-in-hugo-blog',
	)
	uri = uri.replaceAll(
		'/fibonacci-pascal-equation-part-1',
		'/fibonacci-equation-using-pascals-triangle-part-1',
	)
	uri = uri.replaceAll(
		'/fibonacci-pascal-equation-part-2',
		'/fibonacci-equation-using-pascals-triangle-part-2',
	)

	// 2019
	uri = uri.replaceAll(
		'/web-development-years-reflection',
		'/front-end-web-dev-a-years-reflection',
	)

	// 2020
	uri = uri.replaceAll('/fixing-internal-network', '/fixing-my-internal-network')
	uri = uri.replaceAll(
		'/fiddling-ubuntu-server-images',
		'/fiddling-with-ubuntu-server-images',
	)

	// 2022
	uri = uri.replaceAll('/expect-terminal-automation', '/terminal-automation-with-expect')

	// drafts
	uri = uri.replaceAll('/development-philosophy', '/my-development-philosophy')

	return uri
}

export function validateFrontmatter(
	config: Config,
	inputFile: string,
	frontmatter: Partial<Frontmatter>,
) {
	const uri = path.relative(config.contentDir, inputFile)

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
			!['title', 'author', 'date', 'layout', 'categories', 'tags', 'draft'].includes(
				property,
			)
		) {
			throw new Error(
				`Invalid frontmatter property of "${property}" in file: ${inputFile}`,
			)
		}
	}

	return frontmatter as Frontmatter
}
