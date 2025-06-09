import { getNotes } from '#helpers'

export function Head() {
	return `<link rel="stylesheet" href="./notes.css" />`
}

export async function GenerateTemplateVariables({ config, options }) {
	const notes = await getNotes({ config, options })
	notes.sort((a, b) => {
		const aTime = new Date(a.frontmatter.date.toISOString()).getTime()
		const bTime = new Date(b.frontmatter.date.toISOString()).getTime()
		return bTime - aTime
	})

	return {
		notes,
	}
}
