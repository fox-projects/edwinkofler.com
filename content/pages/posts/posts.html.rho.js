export async function GenerateTemplateVariables(ctx) {
	const posts = await ctx.helpers.getPosts(ctx.config)
	posts.sort((a, b) => {
		const aTime = new Date(a.frontmatter.date.toISOString()).getTime()
		const bTime = new Date(b.frontmatter.date.toISOString()).getTime()
		return aTime - bTime
	})

	return {
		posts,
	}
}
