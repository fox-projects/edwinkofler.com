import path from 'node:path'
import { URL } from 'node:url'

const map = new Map()

export const resolve = async (specifier, context, defaultResolve) => {
	const result = await defaultResolve(specifier, context, defaultResolve)
	const child = new URL(result.url)

	if (
		child.protocol === 'nodejs:' ||
		child.protocol === 'node:' ||
		child.pathname.includes('/node_modules/') ||
		path.parse(child.pathname).base.match(/^rho(?:\.\w+)?\.js$/)
	) {
		return result
	}

	const id = map.get(child.pathname)
	if (id) {
		map.set(child.pathname, id + 1)
	} else {
		map.set(child.pathname, 1)
	}

	return {
		url: child.href + '?id=' + map.get(child.pathname),
	}
}
