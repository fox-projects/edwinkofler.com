export async function GenerateSlugMapping({ config, options }) {
	const posts = await config.tenHelpers.getPosts({ config, options })

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

export async function GenerateTemplateVariables({ config, options }, { slug, count }) {
	const posts = await config.tenHelpers.getPosts({ config, options })

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
