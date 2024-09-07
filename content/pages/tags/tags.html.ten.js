export async function GenerateTemplateVariables(ctx) {
	const posts = await ctx.helpers.getPosts(ctx.config)

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
