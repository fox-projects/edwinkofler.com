export async function TemplateVariables(Config, Helpers) {
	const posts = await Helpers.getPosts(Config)

	let categories = []
	for (const post of posts) {
		categories = categories.concat(post.frontmatter.categories || [])
	}

	return {
		categories
	}
}
