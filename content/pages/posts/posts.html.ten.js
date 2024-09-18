export function Header() {
	return {
		content: `
			<link rel="stylesheet" href="./posts.css" />
		`,
	}
}

export async function GenerateTemplateVariables({ config, options }) {
	const posts = await config.tenHelpers.getPosts({ config, options })
	posts.sort((a, b) => {
		const aTime = new Date(a.frontmatter.date.toISOString()).getTime()
		const bTime = new Date(b.frontmatter.date.toISOString()).getTime()
		return aTime - bTime
	})

	return {
		posts,
	}
}
