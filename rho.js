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
import { consola } from 'consola'
import markdownit from 'markdown-it'
import { full as markdownEmoji } from 'markdown-it-emoji'
import Shiki from '@shikijs/markdown-it'
import katex from 'katex'
import browserSync from 'browser-sync'
import chokidar from 'chokidar'

import { ctx as _ctx } from './rho.config.js'
import { markedKatex, markedLinks } from './rho.marked.js'

export { consola }

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
	md.use(markedLinks)
	// md.use(markedKatex, {
	// 	strict: false
	// })
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
    --clean`

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
		console.error(helpText)
		consola.error('No command provided.')
		process.exit(1)
	}

	if (values.help) {
		consola.info(helpText)
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
		console.error(helpText)
		consola.error(`Unknown command: ${positionals[0]}`)
		process.exit(1)
	}
}

export async function cliBuild(/** @type {Ctx} */ ctx) {
	{
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
		consola.info('Clearing build directory...')
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

	consola.success('Done.')
}

async function cliServe(/** @type {Ctx} */ ctx) {
	let bs = null

	initBrowserSync()
	function initBrowserSync() {
		bs = browserSync.create()
		bs.init({
			online: false,
			notify: true,
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
						consola.start(`Listening at http://localhost:${port}`)
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
		.on('add', async (inputFile) => {
			// handleFile(ctx, inputFile) // TODO: Must create tree graph of included files
			cliBuild(ctx)
			bs.reload()
		})
		.on('change', async (inputFile) => {
			// handleFile(ctx, inputFile) // TODO: Must create tree graph of included files
			cliBuild(ctx)
			bs.reload()

			if (inputFile.endsWith('.css')) {
				bs.reload(inputFile)
			}
		})
		.on('error', (error) => {
			consola.error(`Watcher error: ${error}`)
		})

	process.on('SIGINT', () => {
		bs.exit()
		watcher.close().then(() => {
			consola.info('Cleaned up.')
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
		consola.log(`Processing ${inputUri}...`)
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
		await writeFile(path.join(ctx.config.outputDir, outputUri), templatedHtml, contentForm)
		consola.log(`  -> Written to ${outputUri}`)
	} else if (inputFile.endsWith('.html') || inputFile.endsWith('.xml')) {
		consola.log(`Processing ${inputUri}...`)
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
				await writeFile(path.join(ctx.config.outputDir, outputUri), templatedHtml, contentForm)
				consola.log(`  -> Written to ${outputUri}`)
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
			await writeFile(path.join(ctx.config.outputDir, outputUri), templatedHtml, contentForm)
			consola.log(`  -> Written to ${outputUri}`)
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

	async function writeFile(/** @type {string} */ outputFile, /** @type {string} */ html, /** @type {string} */ contentForm) {
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
		if (contentForm === 'post') {
			await fs.cp(path.dirname(inputFile), path.dirname(outputFile), { recursive: true })
			await fs.rm(path.join(path.dirname(outputFile), path.basename(inputFile)))
		}
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
