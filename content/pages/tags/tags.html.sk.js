import { getPosts } from '#helpers'

export async function GenerateTemplateVariables({ config, options }) {
	const posts = await getPosts({ config, options })

	let tags = {}
	for (const post of posts) {
		for (const tag of post.frontmatter.tags ?? []) {
			if (tag in tags) {
				tags[tag] += 1
			} else {
				tags[tag] = 1
			}
		}
	}

	return {
		tags,
	}
}
