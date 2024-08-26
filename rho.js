#!/usr/bin/env node
// @ts-check
import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import url from 'node:url'
import readline from 'node:readline'
import { Readable, Writable } from 'node:stream'

import TOML from 'smol-toml'
import handlebarsImport from 'handlebars'
import { consola } from 'consola'
import markdownit from 'markdown-it'
import { full as markdownEmoji } from 'markdown-it-emoji'
import Shiki from '@shikijs/markdown-it'
import { listen } from 'listhen'
import {
	createApp,
	createError,
	createRouter,
	defineEventHandler,
	setResponseStatus,
	serveStatic,
	sendStream,
	setResponseHeaders,
	toNodeListener,
} from 'h3'
import mime from 'mime-types'

import { ctx as _ctx } from './rho.config.js'
import { markedLinks } from './rho.marked.js'

export { consola }

/**
 * @typedef {typeof _ctx} Ctx
 *
 * @typedef {'build' | 'serve' | 'new'} Subcommands
 *
 * @typedef {Object} RhoJsMeta
 * @property {string} [slug]
 * @property {string} [layout]
 *
 * @typedef {{ slug: string, count: number }[]} RhoJsSlugMapping
 *
 * @typedef {Object} RhoJs
 * @property {() => Promise<RhoJsMeta>} [Meta]
 * @property {(arg0: Ctx) => Promise<any>} [Header]
 * @property {(arg0: Ctx) => Promise<RhoJsSlugMapping>} [GenerateSlugMapping]
 * @property {(arg0: Ctx, arg1: { slug?: string, count?: number }) => Promise<any>} [GenerateTemplateVariables]
 *
 * @typedef {Object} Page
 * @property {string} inputFile
 * @property {string} inputUri
 * @property {string} outputUri
 * @property {string} entrypointUri
 * @property {RhoJs} rhoJs
 * @property {Record<PropertyKey, any>} parameters
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
	},
})
export const MarkdownItInstance = (() => {
	const md = markdownit({
		html: true,
		typographer: true,
		linkify: true,
	})
	md.use(ShikiInstance)
	md.use(markdownEmoji)
	md.use(markedLinks)
	return md
})()
const /** @type {string[]} */ FileQueue = []
const /** @type {Map<string, string>} */ ContentMap = new Map()
const OriginalHandlebarsHelpers = Object.keys(handlebarsImport.helpers)

if (
	(function isTopLevel() {
		// https://stackoverflow.com/a/66309132
		const pathToThisFile = path.resolve(url.fileURLToPath(import.meta.url))
		const pathPassedToNode = path.resolve(process.argv[1])
		const isTopLevel = pathToThisFile.includes(pathPassedToNode)
		return isTopLevel
	})()
) {
	await main()
}

async function main() {
	const helpText = `${path.basename(Filename)} <build | serve | new> [options]
  Options:
    -h, --help
    --clean
    --verbose`

	const { values, positionals } = util.parseArgs({
		allowPositionals: true,
		options: {
			clean: { type: 'boolean' },
			verbose: { type: 'boolean' },
			help: { type: 'boolean', alias: 'h' },
		},
	})
	_ctx.options.command = /** @type {Subcommands} */ (positionals[0])
	_ctx.options.clean = values.clean ?? false
	_ctx.options.verbose = values.verbose ?? false

	/**
	 * Variable _ctx is created at top-level for global type-inference, but we pass it
	 * as a parameter to make testing easier. The top-level variable is prefixed with
	 * an underscore so it is not accidentally used.
	 */
	const ctx = _ctx

	if (!ctx.options.command) {
		console.error(helpText)
		consola.error('No command provided.')
		process.exit(1)
	}

	if (values.help) {
		consola.info(helpText)
		process.exit(0)
	}

	if (ctx.options.command === 'serve') {
		await commandServe(ctx)
	} else if (ctx.options.command === 'build') {
		await commandBuild(ctx)
	} else if (ctx.options.command === 'new') {
		await commandNew(ctx)
	} else {
		console.error(helpText)
		consola.error(`Unknown command: ${positionals[0]}`)
		process.exit(1)
	}
}

async function commandServe(/** @type {Ctx} */ ctx) {
	await fsRegisterHandlebarsHelpers(ctx)
	await fsPopulateContentMap(ctx)

	const app = createApp()
	const router = createRouter()
	app.use(router)

	router.use(
		'/**',
		defineEventHandler(async (event) => {
			try {

				const outputUri = event.path.endsWith('/') ? `${event.path}index.html` : event.path
				const inputUri = ContentMap.get(outputUri)

				setResponseHeaders(event, {
					"Content-Type": mime.lookup(outputUri) || 'text/html',
					"Cache-Control": "no-cache",
					"Expires": "0",
					"Transfer-Encoding": "chunked"
				})

				if (inputUri) {
					// TODO: Fix this
					let content = ''
					const writable2 = new WritableStream({
						write(chunk) {
							content += chunk
						},
					})

					const inputFile = path.join(ctx.defaults.contentDir, inputUri)
					for await (const page of yieldPagesFromInputFile(ctx, inputFile)) {
						const rootRelUri = path.relative(ctx.defaults.rootDir, path.join(ctx.defaults.contentDir, page.inputUri))
						consola.info(`Request (content): ${event.path}  -> ${rootRelUri}`)

						await handleContentFile(ctx, page, writable2)
					}

					const readable2 = Readable.from(content)
					return sendStream(event, readable2)
				} else {
					const rootRelUri = path.relative(ctx.defaults.rootDir, path.join(ctx.defaults.staticDir, event.path))
					consola.info('Request (static):', rootRelUri)

					return serveStatic(event, {
						getContents(id) {
							return fs.readFile(path.join(ctx.defaults.staticDir, id))
						},
						async getMeta(id) {
							const stats = await fs.stat(path.join(ctx.defaults.staticDir, id)).catch(() => null)

							if (!stats?.isFile()) {
								return
							}

							return {
								size: stats.size,
								mtime: stats.mtimeMs
							}
						}
					})
				}
			} catch (err) {
				console.error(err)
			}
		}),
	)

	const listener = await listen(toNodeListener(app), {
		port: 3001,
		showURL: false,
	})
	consola.start(`Listening at http://localhost:${listener.address.port}`)

	process.on('SIGINT', async () => {
		await listener.close()
	})
}

export async function commandBuild(/** @type {Ctx} */ ctx) {
	if (ctx.options.clean) {
		await fsClearBuildDirectory(ctx)
	}
	await fsRegisterHandlebarsHelpers(ctx)
	await addAllContentFilesToFileQueue(ctx)
	await iterateFileQueueByWhileLoop(ctx)
	await fsCopyStaticFiles(ctx)
	consola.success('Done.')
}

async function commandNew(/** @type {Ctx} */ ctx) {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	rl.on('SIGINT', () => {
		consola.error('Aborting...')
		rl.close()
		process.exit(1)
	})
	rl.on('SIGCONT', () => {
		commandNew(ctx)
	})
	rl.question[util.promisify.custom] = (/** @type {string} */ query) => {
		return new Promise((resolve) => {
			rl.question(query, resolve)
		})
	}

	const slug = /** @type {string} */ /** @type {any} */ (
		await util.promisify(rl.question)(`What is the post slug? `)
	)
	const date = new Date()
		.toISOString()
		.replace('T', ' ')
		.replace(/\.[0-9]+Z$/, 'Z')
	const markdownFile = path.join(
		ctx.defaults.contentDir,
		'posts/drafts',
		`${slug}/${slug}.md`,
	)
	await fs.mkdir(path.dirname(markdownFile), { recursive: true })
	await fs.writeFile(
		markdownFile,
		`+++
title = ''
slug = '${slug}'
author = 'Edwin Kofler'
date = ${date}
categories = []
tags = []
draft = true
+++

`,
	)
	rl.close()
	consola.info(`File created at ${markdownFile}`)
}

async function iterateFileQueueByCallback(
	/** @type {Ctx} */ ctx,
	{ onEmptyFileQueue = /** @type {() => void | Promise<void>} */ () => {} } = {},
) {
	let lastCallbackWasEmpty = false
	await cb()

	async function cb() {
		if (FileQueue.length > 0) {
			const inputFile = path.join(ctx.defaults.contentDir, FileQueue[0])
			for await (const page of yieldPagesFromInputFile(ctx, inputFile)) {
				const outputUrl = path.join(ctx.defaults.outputDir, page.outputUri)

				await fs.mkdir(path.dirname(outputUrl), { recursive: true })
				const outputStream = fss.createWriteStream(outputUrl)
				await handleContentFile(ctx, page, Writable.toWeb(outputStream))
			}

			FileQueue.splice(0, 1)
			lastCallbackWasEmpty = false
		} else {
			if (!lastCallbackWasEmpty) {
				await onEmptyFileQueue()
				lastCallbackWasEmpty = true
			}
		}

		setImmediate(cb)
	}
}

async function iterateFileQueueByWhileLoop(/** @type {Ctx} */ ctx) {
	while (FileQueue.length > 0) {
		const inputFile = path.join(ctx.defaults.contentDir, FileQueue[0])
		for await (const page of yieldPagesFromInputFile(ctx, inputFile)) {
			const outputUrl = path.join(ctx.defaults.outputDir, page.outputUri)

			await fs.mkdir(path.dirname(outputUrl), { recursive: true })
			const outputStream = fss.createWriteStream(outputUrl)
			await handleContentFile(ctx, page, Writable.toWeb(outputStream))
		}

		FileQueue.splice(0, 1)
	}
}

/** @returns {AsyncGenerator<Page>} */
async function* yieldPagesFromInputFile(/** @type {Ctx} */ ctx, /** @type {string} */ inputFile) {
	const inputUri = path.relative(ctx.defaults.contentDir, inputFile)
	const entrypointUri = await utilGetEntrypointFromInputUri(ctx, inputFile)
	const rhoJs = await utilExtractRhoJs(ctx, entrypointUri)
	const outputUri = await convertInputUriToOutputUri(ctx, inputUri, rhoJs, entrypointUri)

	/** @type {Page} */
	const page = {
		inputFile,
		inputUri,
		outputUri,
		entrypointUri,
		rhoJs,
		parameters: {}
	}

	if (page.rhoJs.GenerateSlugMapping) {
		const slugMap = (await page.rhoJs.GenerateSlugMapping(ctx)) ?? []
		const originalOutputUri = page.outputUri
		for (const slug of slugMap) {
			const data =
				(await page.rhoJs?.GenerateTemplateVariables?.(ctx, {
					slug: slug.slug,
					count: slug.count,
				})) ?? {}

			page.outputUri = path.join(
				path.dirname(originalOutputUri),
				slug.slug,
				'index.html',
			)
			page.parameters = data

			yield page
		}
	} else {
		const data = (await page.rhoJs?.GenerateTemplateVariables?.(ctx, {})) ?? {}
		page.parameters = data

		yield page
	}
}

async function handleContentFile(
	/** @type {Ctx} */ ctx,
	/** @type {Page} */ page,
	/** @type {WritableStream} */ outputStream
) {
	if (page.inputUri != page.entrypointUri) {
		await handleNonEntrypoint(ctx, page, outputStream)
	} else if (page.entrypointUri) {
		await handleEntrypoint(ctx, page, outputStream)
	} else {
		consola.warn(`No content file found for ${page.inputUri}`)
	}
}

async function handleEntrypoint(/** @type {Ctx} */ ctx, /** @type {Page} */ page, /** @type {WritableStream} */ outputStream) {
	consola.log(`Processing ${page.entrypointUri}...`)
	if (
		// prettier-ignore
		page.inputUri.includes('/_') ||
		page.inputUri.includes('_/')
	) {
		// Do not copy file.
	} else if (page.inputUri.includes('/drafts/')) {
		// Do not copy file.
		// TODO: This should be replaced with something
	} else if (page.entrypointUri.endsWith('.md')) {
		let markdown = await fs.readFile(
			path.join(ctx.defaults.contentDir, page.entrypointUri),
			'utf-8',
		)
		const { html, frontmatter } = (() => {
			let frontmatter = {}
			markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
				frontmatter = TOML.parse(toml)
				return ''
			})

			return {
				html: MarkdownItInstance.render(markdown),
				frontmatter: ctx.config.validateFrontmatter(
					path.join(ctx.defaults.contentDir, page.entrypointUri),
					frontmatter,
				),
			}
		})()

		const layout = await utilExtractLayout(ctx, [
			frontmatter?.layout,
			await ctx.config.getLayout(ctx, page),
			ctx?.defaults?.layout,
			'default.hbs',
		])
		const template = ctx.singletons.handlebars.compile(layout, {
			noEscape: true,
		})
		const templatedHtml = template({
			__title: frontmatter.title,
			__body: html,
			__inputUri: page.entrypointUri,
		})

		await outputStream.getWriter().write(templatedHtml)
		consola.log(`  -> Written to ${page.outputUri}`)
	} else if (
		page.entrypointUri.endsWith('.html') ||
		page.entrypointUri.endsWith('.xml')
	) {
		let html = await fs.readFile(
			path.join(ctx.defaults.contentDir, page.entrypointUri),
			'utf-8',
		)
		const template = ctx.singletons.handlebars.compile(html, {
			noEscape: true,
		})
		let templatedHtml = template({
			...page.parameters,
			__inputUri: page.entrypointUri,
		})
		const meta = await page.rhoJs?.Meta?.()
		const header = await page.rhoJs?.Header?.(ctx)
		const layout = await utilExtractLayout(ctx, [
			meta?.layout,
			await ctx.config.getLayout(ctx, page),
			ctx?.defaults?.layout,
			'default.hbs',
		])

		templatedHtml = ctx.singletons.handlebars.compile(layout, {
			noEscape: true,
		})({
			__body: templatedHtml,
			__header_title: header?.title ?? ctx?.defaults?.title ?? 'Website',
			__header_content: header?.content ?? '',
			__inputUri: page.entrypointUri,
		})

		await outputStream.getWriter().write(templatedHtml)
		consola.log(`  -> Written to ${page.outputUri}`)
	}
}

async function handleNonEntrypoint(/** @type {Ctx} */ ctx, /** @type {Page} */ page, /** @type {WritableStream} */ outputStream) {
	if (
		page.inputUri.includes('/_') ||
		page.inputUri.includes('_/') ||
		path.parse(page.inputUri).name.endsWith('_') ||
		page.inputUri.endsWith('.rho.js')
	) {
		// Do not copy file.
	} else if (page.inputUri.includes('/drafts/')) {
		// Do not copy file.
		// TODO: This should be replaced with something
	} else if (page.inputUri.match(/\.[a-zA-Z]+\.js$/)) {
		throw new Error(`Did you mean to append ".rho.js" for file: ${page.inputFile}?`)
	} else {
		// const readable = Readable.toWeb(fss.createReadStream(page.inputFile))
		// readable.pipeTo(outputStream)
		const content = await fs.readFile(page.inputFile, 'utf-8')
		outputStream.getWriter().write(content)
	}
}

async function fsCopyStaticFiles(/** @type {Ctx} */ ctx) {
	try {
		await fs.cp(ctx.defaults.staticDir, ctx.defaults.outputDir, {
			recursive: true,
		})
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsClearBuildDirectory(/** @type {Ctx} */ ctx) {
	consola.info('Clearing build directory...')
	try {
		await fs.rm(ctx.defaults.outputDir, { recursive: true })
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}
}

async function fsPopulateContentMap(/** @type {Ctx} */ ctx) {
	await walk(ctx.defaults.contentDir)

	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const subdir = path.join(entry.parentPath, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(entry.parentPath, entry.name)
				for await (const page of yieldPagesFromInputFile(ctx, inputFile)) {
					consola.log(`Adding ${page.outputUri} -> ${page.inputUri}`)
					ContentMap.set(page.outputUri, page.inputUri)
				}
			}
		}
	}
}

async function fsRegisterHandlebarsHelpers(/** @type {Ctx} */ ctx) {
	const handlebars = handlebarsImport.create()

	// Re-register partials.
	for (const partial in handlebars.partials) {
		handlebars.unregisterPartial(partial)
	}
	try {
		for (const partialFilename of await fs.readdir(ctx.defaults.partialsDir)) {
			const partialContent = await fs.readFile(
				path.join(ctx.defaults.partialsDir, partialFilename),
				'utf-8',
			)

			handlebars.registerPartial(path.parse(partialFilename).name, partialContent)
		}
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}

	// Re-register helpers.
	for (const helper in ctx.handlebarsHelpers) {
		if (OriginalHandlebarsHelpers.includes(helper)) continue

		handlebars.unregisterHelper(helper)
	}
	for (const helper in ctx.handlebarsHelpers) {
		handlebars.registerHelper(helper, ctx.handlebarsHelpers[helper])
	}

	ctx.singletons.handlebars = handlebars
}

async function addAllContentFilesToFileQueue(/** @type {Ctx} */ ctx) {
	await walk(ctx.defaults.contentDir)
	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const subdir = path.join(dir, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(entry.parentPath, entry.name)
				const inputUri = path.relative(ctx.defaults.contentDir, inputFile)
				FileQueue.push(inputUri)
			}
		}
	}
}

async function convertInputUriToOutputUri(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputUri,
	/** @type {RhoJs} */ rhoJs,
	/** @type {string | null} */ entrypointUri,
) {
	inputUri = ctx.config.customUriTransform(inputUri)

	// For an `inputFile` of `/a/b/c.txt`, this extracts `/a`.
	const pathPart = path.dirname(path.dirname(inputUri))
	// For an `inputFile` of `/a/b/c.txt`, this extracts `b`.
	const parentDirname = path.basename(path.dirname(inputUri))

	// If `parentDirname` is a "file".
	if (parentDirname.includes('.') && parentDirname !== '.') {
		return path.join(pathPart, path.parse(inputUri).base)
	} else if (!inputUri.endsWith('.html') && !inputUri.endsWith('.md')) {
		const relPart = await getNewParentDirname()
		return path.join(pathPart, relPart, path.parse(inputUri).base)
	} else if (path.parse(inputUri).name === parentDirname) {
		const parentDirname = await getNewParentDirname()
		return path.join(pathPart, parentDirname, 'index.html')
	} else {
		const relPart = await getNewParentDirname()
		return path.join(pathPart, relPart, path.parse(inputUri).name + '.html')
	}

	async function getNewParentDirname() {
		const inputFile = path.join(ctx.defaults.contentDir, inputUri)

		const meta = await rhoJs?.Meta?.()
		if (meta?.slug) {
			return meta.slug
		}

		if (entrypointUri) {
			const frontmatter = await extractContentFileFrontmatter(
				ctx,
				inputFile,
				entrypointUri,
			)
			return frontmatter.slug ?? path.basename(path.dirname(inputUri))
		} else {
			return path.basename(path.dirname(inputUri))
		}
	}
}

async function extractContentFileFrontmatter(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputFile,
	/** @type {string} */ entrypointUri,
) {
	if (!inputFile) return {}
	const entrypointFile = path.join(ctx.defaults.contentDir, entrypointUri)

	let markdown
	try {
		markdown = await fs.readFile(entrypointFile, 'utf-8')
	} catch {
		return {}
	}

	let frontmatter = {}
	markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
		frontmatter = TOML.parse(toml)
		return ''
	})

	return ctx.config.validateFrontmatter(entrypointFile, frontmatter)
}

async function utilExtractLayout(/** @type {Ctx} */ ctx, /** @type {any[]} */ layouts) {
	for (const layout of layouts) {
		if (layout instanceof Buffer) {
			return layout.toString()
		} else if (typeof layout === 'string') {
			return await fs.readFile(path.join(ctx.defaults.layoutDir, layout), 'utf-8')
		}
	}
}

async function utilExtractRhoJs(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ entrypointUri,
) {
	const entrypointFile = path.join(ctx.defaults.contentDir, entrypointUri)

	try {
		const javascriptFile = path.join(
			path.dirname(entrypointFile),
			path.parse(entrypointFile).base + '.rho.js',
		)
		let /** @type {RhoJs} */ rhoJs = await import(javascriptFile)
		return rhoJs
	} catch (err) {
		if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
	}
	return {}
}

async function utilGetEntrypointFromInputUri(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputFile,
) {
	const inputUri = path.relative(ctx.defaults.contentDir, inputFile)
	const dirname = path.basename(path.dirname(inputUri))
	// prettier-ignore
	let fileUris = [
		'index.md',
		'index.html',
		'index.xml',
	]
	if (dirname !== '.') {
		// prettier-ignore
		fileUris = fileUris.concat([
			dirname + '.md',
			dirname + '.html',
			dirname + '.xml',
			dirname,
		])
	}

	// Search for a valid "content file" in the same directory.
	for (const uri of fileUris) {
		const file = path.join(path.dirname(inputFile), uri)
		if (['.md', '.html', '.xml'].includes(path.parse(uri).ext)) {
			try {
				await fs.stat(file)
				return path.relative(ctx.defaults.contentDir, file)
			} catch {}
		}
	}

	throw new Error(`No entrypoint found for file: ${inputFile}`)
}

async function utilFileExists(/** @type {string} */ file) {
	return await fs.stat(file).then(() => true).catch(() => false)
}
