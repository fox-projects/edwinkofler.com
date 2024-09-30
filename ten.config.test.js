import { test } from 'node:test'
import assert from 'node:assert/strict'

import { transformUri } from './ten.config.js'

test("transformUri", () => {
	// Pages.
	assert.equal(
		transformUri('pages/thing'),
		'thing'
	)

	// Posts.
	assert.equal(
		transformUri('posts/2020/thing'),
		'posts/thing'
	)
	assert.equal(
		transformUri('posts/anything/thing'),
		'posts/thing'
	)
	assert.equal(
		transformUri('posts/2018/hugo-render-latex-with-katex/hugo-render-latex-with-katex.md'),
		'posts/render-latex-with-katex-in-hugo-blog/render-latex-with-katex-in-hugo-blog.md'
	)
	assert.equal(
		transformUri('posts/2018/fibonacci-pascal-equation-part-1/fibonacci-pascal-equation-part-1.md'),
		'posts/fibonacci-equation-using-pascals-triangle-part-1/fibonacci-equation-using-pascals-triangle-part-1.md'
	)
})
