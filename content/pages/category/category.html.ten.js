export async function GenerateSlugMapping(ctx) {
	const posts = await ctx.helpers.getPosts(ctx.config)

	let categories = {}
	for (const post of posts) {
		for (const category of post.frontmatter.categories || []) {
			if (category in categories) {
				categories[category] += 1
			} else {
				categories[category] = 1
			}
		}
	}

	const tagsArr = Object.keys(categories).map((category) => {
		return {
			slug: category,
			count: categories[category],
		}
	})
	return tagsArr
}

export async function GenerateTemplateVariables(ctx, { slug, count }) {
	const posts = await ctx.helpers.getPosts(ctx.config)

	let filteredPosts = []
	for (const post of posts) {
		if ((post.frontmatter.categories ?? []).includes(slug)) {
			filteredPosts.push(post)
		}
	}

	return {
		category: slug,
		posts: filteredPosts,
	}
}
