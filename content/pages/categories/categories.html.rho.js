export async function GenerateTemplateVariables(ctx) {
	const posts = await ctx.helpers.getPosts(ctx.config)

	let categories = []
	for (const post of posts) {
		categories = categories.concat(post.frontmatter.categories || [])
	}

	return {
		categories,
	}
}
