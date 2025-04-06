import { getPosts } from '#helpers'

export async function GenerateTemplateVariables({ config, options }) {
	const posts = await getPosts({ config, options })

	let categories = []
	for (const post of posts) {
		categories = categories.concat(post.frontmatter.categories || [])
	}

	return {
		categories,
	}
}
