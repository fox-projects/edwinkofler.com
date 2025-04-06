import { getPosts } from '#helpers'

export async function GenerateSlugMapping({ config, options }) {
	const posts = await getPosts({ config, options })

	let tags = {}
	for (const post of posts) {
		for (const tag of post.frontmatter.tags || []) {
			if (tag in tags) {
				tags[tag] += 1
			} else {
				tags[tag] = 1
			}
		}
	}

	const tagsArr = Object.keys(tags).map((tag) => {
		return {
			slug: tag,
			count: tags[tag],
		}
	})
	return tagsArr
}

export async function GenerateTemplateVariables({ config, options }, { slug, count }) {
	const posts = await getPosts({ config, options })

	let filteredPosts = []
	for (const post of posts) {
		if ((post.frontmatter.tags ?? []).includes(slug)) {
			filteredPosts.push(post)
		}
	}
	return {
		tag: slug,
		posts: filteredPosts,
	}
}
