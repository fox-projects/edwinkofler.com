export async function GenerateSlugMapping(ctx) {
	const posts = await Helpers.getPosts(ctx.config)

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

export async function GenerateTemplateVariables(Config, Helpers, { slug, count }) {
	const posts = await Helpers.getPosts(Config)

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
