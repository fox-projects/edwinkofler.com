export async function GenerateTemplateVariables(Config, Helpers) {
	const posts = await Helpers.getPosts(Config)
	posts.sort((a, b) => {
		const aTime = new Date(a.frontmatter.date.toISOString()).getTime()
		const bTime = new Date(b.frontmatter.date.toISOString()).getTime()
		return aTime - bTime
	})

	return {
		posts,
	}
}
