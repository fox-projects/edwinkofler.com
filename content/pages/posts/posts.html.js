export async function GenerateTemplateVariables(Config, Helpers) {
	const posts = await Helpers.getPosts(Config)

	return {
		posts
	}
}
