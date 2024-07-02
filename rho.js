#!/usr/bin/env node
// @ts-check
import fs from 'node:fs/promises'
import path from 'node:path'
import util from 'node:util'
import url from 'node:url'

import prettier from 'prettier'
import { execa } from 'execa'
import TOML from 'smol-toml'
import handlebars from 'handlebars'
import * as htmlparser2 from "htmlparser2";
import markdownit from 'markdown-it'
import { full as markdownEmoji } from 'markdown-it-emoji'
import Shiki from '@shikijs/markdown-it'
import katex from 'katex'
import browserSync from 'browser-sync'
import chokidar from 'chokidar'

import { ctx as _ctx } from './rho.config.js'

/**
 * @typedef {'pages' | 'posts' | 'thoughts' | 'til'} ContentForm
 *
 * @typedef {typeof _ctx} Ctx
 *
 * @typedef {Object} Frontmatter
 * @property {string} title
 * @property {string} author
 * @property {Date} date
 * @property {string} [layout]
 * @property {string} [slug]
 * @property {string[]} [categories]
 * @property {string[]} [tags]
 */


const Filename = new URL(import.meta.url).pathname
const Dirname = path.dirname(Filename)
const markedKatex = markedKatexFactory()
const ShikiInstance = await Shiki({
	themes: {
		light: 'github-light',
		dark: 'github-dark',
	}
})
export const MarkdownItInstance = (() => {
	const md = markdownit({
		html: true,
		typographer: true,
		linkify: true
	})
	md.use(ShikiInstance)
	md.use(markdownEmoji)
	md.use(markedKatex, {
		strict: false
	})
	return md
})()
const OriginalHandlebarsHelpers = Object.keys(handlebars.helpers)

const log = {
	debug(/** @type {string} */ msg) {
		if (!process.env.TEST) {
			console.debug(msg)
		}
	},
	info(/** @type {string} */ msg) {
		if (!process.env.TEST) {
			console.info(msg)
		}
	},
	error(/** @type {string} */ msg) {
		console.error(msg)
	}
}

if ((function isTopLevel() {
	// https://stackoverflow.com/a/66309132
	const pathToThisFile = path.resolve(url.fileURLToPath(import.meta.url))
	const pathPassedToNode = path.resolve(process.argv[1])
	const isTopLevel = pathToThisFile.includes(pathPassedToNode)
	return isTopLevel
})()) {
	const helpText = `${path.basename(Filename)} <build | serve | check> [options]
  Options:
    -h, --help
    --verbose
    --clean
`

	const { values, positionals } = util.parseArgs({
		allowPositionals: true,
		options: {
			clean: { type: 'boolean' },
			verbose: { type: 'boolean' },
			help: { type: 'boolean', alias: 'h' },
		}
	})
	_ctx.options.clean = values.clean ?? false
	_ctx.options.verbose = values.verbose ?? false

	if (!positionals[0]) {
		log.error(helpText)
		log.error('No command provided.')
		process.exit(1)
	}

	if (values.help) {
		log.info(helpText)
		process.exit(0)
	}

	/*
	 * Variable _ctx is created at top-level for global type-inference, but we pass it
	 * as a parameter to make testing easier. The top-level variable is prefixed with
	 * an underscore so it is not accidentally used
	 */
	const ctx = _ctx

	if (positionals[0] === 'build') {
		await cliBuild(ctx)
	} else if (positionals[0] === 'serve') {
		await cliServe(ctx)
	} else if (positionals[0] === 'check') {
		await cliCheck(ctx)
	} else {
		log.error(helpText)
		log.error(`Unknown command: ${positionals[0]}`)
		process.exit(1)
	}
}

export async function cliBuild(/** @type {Ctx} */ ctx) {
	{
		/*
		 * TODO: When using Nodemon, sometimes this is buggy?
		 */

		for (const partial in handlebars.partials) {
			handlebars.unregisterPartial(partial)
		}
		try {
			for (const partialFilename of await fs.readdir(ctx.config.partialsDir)) {
				const partialContent = await fs.readFile(path.join(ctx.config.partialsDir, partialFilename), 'utf-8')
				handlebars.registerPartial(path.parse(partialFilename).name, partialContent)
			}
		} catch (err) {
			if (err.code !== 'ENOENT') throw err
		}
	}

	{
		for (const helper in ctx.handlebarsHelpers) {
			if (OriginalHandlebarsHelpers.includes(helper)) continue

			handlebars.unregisterHelper(helper)
		}
		for (const helper in ctx.handlebarsHelpers) {
			handlebars.registerHelper(helper, ctx.handlebarsHelpers[helper])
		}
	}

	if (ctx.options.clean) {
		log.info('Clearing build directory...')
		try {
			await fs.rm(ctx.config.outputDir, { recursive: true })
		} catch (err) {
			if (err.code !== 'ENOENT') throw err
		}
	}

	/*
	 * Generate content
	 */
	await walk(ctx.config.contentDir)
	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const subdir = path.join(dir, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(dir, entry.name)
				await handleFile(ctx, inputFile)
			}
		}
	}

	/*
	 * Copy static files
	 */
	try {
		await fs.cp(ctx.config.staticDir, ctx.config.outputDir, { recursive: true })
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}

	log.info('Done.')
}

async function cliServe(/** @type {Ctx} */ ctx) {
	let bs = null

	initBrowserSync()
	function initBrowserSync() {
		bs = browserSync.create()
		bs.init({
			online: false,
			notify: false,
			open: false,
			minify: false,
			ui: false,
			server: ctx.config.outputDir,
			...ctx.options.verbose ? {} : { logLevel: 'silent' },
			callbacks: {
				ready(err, bs) {
					if (err) throw err

					if (!ctx.options.verbose) {
						const port = bs.getOption('port')
						log.info(`Listening at http://localhost:${port}`)
					}
				}
			}
		})
	}

	const watcher = chokidar.watch([
		ctx.config.contentDir,
		ctx.config.layoutDir,
		ctx.config.partialsDir,
		ctx.config.staticDir,
	], {
		persistent: true,
		ignoreInitial: true,
	})
	watcher
		.on('add', async (path) => {
			await cliBuild(ctx)
			bs.reload()
		})
		.on('change', async (path) => {
			await cliBuild(ctx)
			bs.reload()

			if (path.endsWith('.css')) {
				bs.reload(path)
			}
		})
		.on('error', (error) => {
			log.error(`Watcher error: ${error}`)
		})

	process.on('SIGINT', () => {
		bs.exit()
		watcher.close().then(() => {
			log.info('Cleaned up.')
			process.exit(0)
		})
	})

	await cliBuild(ctx)
}

async function cliCheck(/** @type {Ctx} */ ctx) {
	try {
		await execa({
			stdout: 'inherit',
			stderr: 'inherit',
		})`lychee --offline ${Dirname}`
	} catch (err) {
		if (err.exitCode !== 2) {
			throw err
		}
	}
}

/**
 * @param {*} inputFile
 * @param {*} frontmatter
 * @param {*} contentForm
 * @returns {Frontmatter}
 */
export function validateFrontmatter(/** @type {string} */ inputFile, /** @type {Partial<Frontmatter>} */ frontmatter, /** @type {ContentForm} */ contentForm) {
	if (contentForm === 'posts') {
		for (const requiredProperty of ['title', 'author', 'date']) {
			if (!(requiredProperty in frontmatter)) {
				throw new Error(`Missing required frontmatter property of "${requiredProperty}" in file: ${inputFile}`)
			}
		}
	}

	for (const property in frontmatter) {
		if (!['title', 'author', 'date', 'layout', 'slug', 'categories', 'tags'].includes(property)) {
			throw new Error(`Invalid frontmatter property of "${property}" in file: ${inputFile}`)
		}
	}

	return /** @type {Frontmatter} */ (frontmatter)
}

async function handleFile(/** @type {Ctx} */ ctx, /** @type {string} */ inputFile) {
	const inputUri = path.relative(ctx.config.contentDir, inputFile)
	const inputUriTransformed = ctx.config.transformOutputUri(inputUri)
	const contentForm = /** @type {ContentForm} */ (inputUri.slice(0, inputUri.indexOf('/')))

	if (inputFile.endsWith('.md')) {
		log.info(`Processing ${inputUri}...`)
		let markdown = await fs.readFile(inputFile, 'utf8')
		const { html, frontmatter } = (() => {
			let frontmatter = {}
			markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
				frontmatter = TOML.parse(toml)
				return ''
			})

			return {
				html: MarkdownItInstance.render(markdown),
				frontmatter: validateFrontmatter(inputFile, frontmatter, contentForm)
			}
		})()
		const layout = frontmatter.layout
			? await fs.readFile(path.join(ctx.config.layoutDir, frontmatter.layout), 'utf-8')
			: await ctx.config.getLayoutContent(inputUri, contentForm)
		const template = handlebars.compile(layout, {
			noEscape: true,
		})
		const templatedHtml = template({
			__title: frontmatter.title,
			__body: html,
			__inputUri: inputUri
		})

		const relPart = frontmatter.slug ?? path.basename(path.dirname(inputUriTransformed))
		const outputUri = getOutputUriPart(inputUriTransformed, relPart)
		await writeFile(path.join(ctx.config.outputDir, outputUri), templatedHtml)
		log.info(`  -> Written to ${outputUri}`)
	} else if (inputFile.endsWith('.html') || inputFile.endsWith('.xml')) {
		log.info(`Processing ${inputUri}...`)
		let module = {}
		try {
			const javascriptFile = path.join(path.dirname(inputFile), path.parse(inputFile).base + '.js')
			module = await import(javascriptFile)
		} catch (err) {
			if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
		}

		let html = await fs.readFile(inputFile, 'utf8')
		if (module.GenerateSlugMapping) {
			const slugMap = (await module?.GenerateSlugMapping(ctx.config, ctx.helpers)) ?? []
			for (const slug of slugMap) {
				const data = await module?.GenerateTemplateVariables?.(ctx.config, ctx.helpers, slug) ?? {}
				const template = handlebars.compile(html, {
					noEscape: true,
				})
				let templatedHtml = template({
					...data,
					__inputUri: inputUri
				})
				const layout = await ctx.config.getLayoutContent(inputUri, contentForm)
				templatedHtml = handlebars.compile(layout, {
					noEscape: true
				})({
					__body: templatedHtml,
					__inputUri: inputUri
				})

				const dirname = path.basename(path.dirname(inputUriTransformed))
				const outputUri = getOutputUriPart(inputUriTransformed, `${dirname}/${slug.slug}`)
				await writeFile(path.join(ctx.config.outputDir, outputUri), templatedHtml)
				log.info(`  -> Written to ${outputUri}`)
			}
		} else {
			const data = (await module?.GenerateTemplateVariables?.(ctx.config, ctx.helpers, {})) ?? {}
			const template = handlebars.compile(html, {
				noEscape: true,
			})
			let templatedHtml = template({
				...data,
				__inputUri: inputUri
			})
			const layout = await ctx.config.getLayoutContent(inputUri, contentForm)
			templatedHtml = handlebars.compile(layout, {
				noEscape: true
			})({
				__body: templatedHtml,
				__inputUri: inputUri
			})

			const relPart = path.basename(path.dirname(inputUriTransformed))
			const outputUri = getOutputUriPart(inputUriTransformed, relPart)
			await writeFile(path.join(ctx.config.outputDir, outputUri), templatedHtml)
			log.info(`  -> Written to ${outputUri}`)
		}
	} else if (inputFile.endsWith('.js')) {
		const contentFile = path.join(path.dirname(inputFile), path.parse(inputFile).name)
		try {
			await fs.stat(contentFile)
		} catch (err) {
			if (err.code === 'ENOENT') {
				throw new Error(`Expected to find content file ${path.basename(contentFile)} adjacent to JavaScript file: ${inputFile}`)
			}
		}
		return
	} else {
		// Ignore other file types like '.tex' and '.png'.
	}

	async function writeFile(/** @type {string} */ outputFile, /** @type {string} */ html) {
		await fs.mkdir(path.dirname(outputFile), { recursive: true })
		// TODO
		// try {
		// 	html = await prettier.format(html, {
		// 		filepath: outputFile
		// 	})
		// } catch (err) {
		// 	// Don't throw when attempting to format an unsupported file.
		// 	if (err.name !== 'UndefinedParserError') throw err
		// }

		await fs.writeFile(outputFile, html)
		// if (contentType === 'posts') {
		// 	await fs.cp(path.dirname(inputFile), path.dirname(outputFile), { recursive: true })
		// 	await fs.rm(path.join(path.dirname(outputFile), path.basename(inputFile)))
		// }
	}
}

function getOutputUriPart(/** @type {string} */ uri, /** @type {string} */ relPart) {
	if (!uri.endsWith('.html') && !uri.endsWith('.md')) {
		return uri
	}
	const dirname = path.basename(path.dirname(uri))
	const beforeDirnamePart = path.dirname(path.dirname(uri))
	if (path.parse(uri).name === dirname) {
		return path.join(beforeDirnamePart, relPart, 'index.html')
	}

	return path.join(beforeDirnamePart, relPart, path.parse(uri).name + '.html')
}

// https://github.com/xtthaop/markdown-it-katex/blob/master/index.js
function markedKatexFactory() {
	return function markedKatex(md, options) {
		options = options || {};

		// set KaTeX as the renderer for markdown-it-simplemath
		var katexInline = function (latex) {
			options.displayMode = false;
			try {
				return katex.renderToString(latex, options);
			}
			catch (error) {
				if (options.throwOnError) { log.error(error); }
				return latex;
			}
		};

		var inlineRenderer = function (tokens, idx) {
			return katexInline(tokens[idx].content);
		};

		var katexBlock = function (latex) {
			options.displayMode = true;
			try {
				return "<p>" + katex.renderToString(latex, options) + "</p>";
			}
			catch (error) {
				if (options.throwOnError) { log.error(error); }
				return latex;
			}
		}

		var blockRenderer = function (tokens, idx) {
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
