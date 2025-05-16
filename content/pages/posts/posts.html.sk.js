import { getPosts } from '#helpers'

export function Head() {
	return {
		content: `
			<link rel="stylesheet" href="./posts.css" />
		`,
	}
}

export async function GenerateTemplateVariables({ config, options }) {
	const posts = await getPosts({ config, options })
	posts.sort((a, b) => {
		const aTime = new Date(a.frontmatter.date.toISOString()).getTime()
		const bTime = new Date(b.frontmatter.date.toISOString()).getTime()
		return bTime - aTime
	})

	return {
		posts,
	}
}
