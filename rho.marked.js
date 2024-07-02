// https://github.com/markdown-it/markdown-it/blob/0fe7ccb4b7f30236fb05f623be6924961d296d3d/docs/architecture.md?plain=1#L134
export function markedLinks(md, options) {
	const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
		return self.renderToken(tokens, idx, options);
	};

	md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
		const href = tokens[idx].attrGet('href')

		if ((href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#')) {
			tokens[idx].attrSet('target', '_self');
		} else {
			tokens[idx].attrSet('target', '_blank');
		}

		// Pass the token to the default renderer.
		return defaultRender(tokens, idx, options, env, self);
	};
}

// https://github.com/xtthaop/markdown-it-katex/blob/master/index.js
export function markedKatex(md, options) {
	options = options || {};

	// set KaTeX as the renderer for markdown-it-simplemath
	const katexInline = function (latex) {
		options.displayMode = false;
		try {
			return katex.renderToString(latex, options);
		}
		catch (error) {
			if (options.throwOnError) { log.error(error); }
			return latex;
		}
	};

	const inlineRenderer = function (tokens, idx) {
		return katexInline(tokens[idx].content);
	};

	const katexBlock = function (latex) {
		options.displayMode = true;
		try {
			return "<p>" + katex.renderToString(latex, options) + "</p>";
		}
		catch (error) {
			if (options.throwOnError) { log.error(error); }
			return latex;
		}
	}

	const blockRenderer = function (tokens, idx) {
		return katexBlock(tokens[idx].content) + '\n';
	}

	md.inline.ruler.after('escape', 'math_inline', math_inline);
	md.block.ruler.after('blockquote', 'math_block', math_block, {
		alt: ['paragraph', 'reference', 'blockquote', 'list']
	});
	md.renderer.rules.math_inline = inlineRenderer;
	md.renderer.rules.math_block = blockRenderer;
};

// Test if potential opening or closing delimieter
// Assumes that there is a "$" at state.src[pos]
function isValidDelim(state, pos) {
	var prevChar, nextChar,
		max = state.posMax,
		can_open = true,
		can_close = true;

	prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
	nextChar = pos + 1 <= max ? state.src.charCodeAt(pos + 1) : -1;

	// Check non-whitespace conditions for opening and closing, and
	// check that closing delimeter isn't followed by a number
	if (prevChar === 0x20/* " " */ || prevChar === 0x09/* \t */ ||
		(nextChar >= 0x30/* "0" */ && nextChar <= 0x39/* "9" */)) {
		can_close = false;
	}
	if (nextChar === 0x20/* " " */ || nextChar === 0x09/* \t */) {
		can_open = false;
	}

	return {
		can_open: can_open,
		can_close: can_close
	};
}

function math_inline(state, silent) {
	var start, match, token, res, pos, esc_count;

	if (state.src[state.pos] !== "$") { return false; }

	res = isValidDelim(state, state.pos);
	if (!res.can_open) {
		if (!silent) { state.pending += "$"; }
		state.pos += 1;
		return true;
	}

	// First check for and bypass all properly escaped delimieters
	// This loop will assume that the first leading backtick can not
	// be the first character in state.src, which is known since
	// we have found an opening delimieter already.
	start = state.pos + 1;
	match = start;
	while ((match = state.src.indexOf("$", match)) !== -1) {
		// Found potential $, look for escapes, pos will point to
		// first non escape when complete
		pos = match - 1;
		while (state.src[pos] === "\\") { pos -= 1; }

		// Even number of escapes, potential closing delimiter found
		if (((match - pos) % 2) == 1) { break; }
		match += 1;
	}

	// No closing delimter found.  Consume $ and continue.
	if (match === -1) {
		if (!silent) { state.pending += "$"; }
		state.pos = start;
		return true;
	}

	// Check if we have empty content, ie: $$.  Do not parse.
	if (match - start === 0) {
		if (!silent) { state.pending += "$$"; }
		state.pos = start + 1;
		return true;
	}

	// Check for valid closing delimiter
	res = isValidDelim(state, match);
	if (!res.can_close) {
		if (!silent) { state.pending += "$"; }
		state.pos = start;
		return true;
	}

	if (!silent) {
		token = state.push('math_inline', 'math', 0);
		token.markup = "$";
		token.content = state.src.slice(start, match);
	}

	state.pos = match + 1;
	return true;
}

function math_block(state, start, end, silent) {
	var firstLine, lastLine, next, lastPos, found = false, token,
		pos = state.bMarks[start] + state.tShift[start],
		max = state.eMarks[start]

	if (pos + 2 > max) { return false; }
	if (state.src.slice(pos, pos + 2) !== '$$') { return false; }

	pos += 2;
	firstLine = state.src.slice(pos, max);

	if (silent) { return true; }
	if (firstLine.trim().slice(-2) === '$$') {
		// Single line expression
		firstLine = firstLine.trim().slice(0, -2);
		found = true;
	}

	for (next = start; !found;) {

		next++;

		if (next >= end) { break; }

		pos = state.bMarks[next] + state.tShift[next];
		max = state.eMarks[next];

		if (pos < max && state.tShift[next] < state.blkIndent) {
			// non-empty line with negative indent should stop the list:
			break;
		}

		if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
			lastPos = state.src.slice(0, max).lastIndexOf('$$');
			lastLine = state.src.slice(pos, lastPos);
			found = true;
		}

	}

	state.line = next + 1;

	token = state.push('math_block', 'math', 0);
	token.block = true;
	token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '')
		+ state.getLines(start + 1, next, state.tShift[start], true)
		+ (lastLine && lastLine.trim() ? lastLine : '');
	token.map = [start, state.line];
	token.markup = '$$';
	return true;
}

// TODO: marked-katex-extension
// const marked = new Marked(
// 	markedHighlight({
// 		langPrefix: 'hljs language-',
// 		// async: true,
// 		highlight(code, lang, info) {
// 			const language = hljs.getLanguage(lang) ? lang : 'plaintext';
// 			return hljs.highlight(code, { language }).value;

// 			// return new Promise((resolve, reject) => {
// 			// 	codeToHtml(code, {
// 			// 		lang: language,
// 			// 		theme: 'vitesse-dark'
// 			// 	}).then((html) => {
// 			// 		resolve(html)
// 			// 	}).catch((err) => {
// 			// 		reject(err)
// 			// 	})
// 			// })
// 		}
// 	})
// )
// marked.use({
// 	renderer: {
// 		link(href, title, text) {
// 			const isLocalLink = href.startsWith(`/`) || href.startsWith('.')
// 			if (isLocalLink) {
// 				return html
// 			} else {
// 				// https://github.com/markedjs/marked/discussions/2982#discussioncomment-6979586
// 				const html = marked.Renderer.prototype.link.call(this, href, title, text)
// 				return html.replace(/^<a /, '<a target="_blank" rel="nofollow" ')
// 			}

// 		}
// 	}
// })
// marked.use(markedEmoji({
// 	// @ts-expect-error
// 	emojis: Emojis,
// 	renderer: (token) => token.emoji
// }))
// // @ts-expect-error
//
// const Emojis = await (async () => {
// 	const emojis = {}
// 	for (const entry of gemoji) {
// 		for (const slug of entry.names) {
// 			emojis[slug] = entry.emoji
// 		}
// 	}
// 	return emojis
// })()
