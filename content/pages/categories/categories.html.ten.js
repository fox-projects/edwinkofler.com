export async function GenerateTemplateVariables({ config, options }) {
	const posts = await config.tenHelpers.getPosts({ config, options })

	let categories = []
	for (const post of posts) {
		categories = categories.concat(post.frontmatter.categories || [])
	}

	return {
		categories,
	}
}
