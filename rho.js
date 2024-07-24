#!/usr/bin/env node
// @ts-check
import fs from 'node:fs/promises'
import path from 'node:path'
import util from 'node:util'
import url from 'node:url'

import prettier from 'prettier'
import { execa } from 'execa'
import TOML from 'smol-toml'
import handlebarsImport from 'handlebars'
import { consola } from 'consola'
import markdownit from 'markdown-it'
import { full as markdownEmoji } from 'markdown-it-emoji'
import Shiki from '@shikijs/markdown-it'
import katex from 'katex'
import browserSync from 'browser-sync'
import chokidar from 'chokidar'
import { listen, listenAndWatch } from 'listhen'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'

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
	// md.use(markedKatex, {
	// 	strict: false
	// })
	return md
})()
const Cache = await (async () => {
	try {
		const text = await fs.readFile(_ctx.config.cacheFile, 'utf-8')
		return JSON.parse(text)
	} catch (err) {
		if (err.code === 'ENOENT') {
			return {}
		} else {
			throw err
		}
	}
})()
const /** @type {string[]} */ FileQueue = []
const OriginalHandlebarsHelpers = Object.keys(handlebarsImport.helpers)
// _ctx.singletons.handlebars = handlebarsImport.create()

if (
	(function isTopLevel() {
		// https://stackoverflow.com/a/66309132
		const pathToThisFile = path.resolve(url.fileURLToPath(import.meta.url))
		const pathPassedToNode = path.resolve(process.argv[1])
		const isTopLevel = pathToThisFile.includes(pathPassedToNode)
		return isTopLevel
	})()
) {
	const helpText = `${path.basename(Filename)} <build | serve | check> [options]
  Options:
    -h, --help
    --clean
    --verbose
    --no-cache`

	const { values, positionals } = util.parseArgs({
		allowPositionals: true,
		options: {
			clean: { type: 'boolean' },
			verbose: { type: 'boolean' },
			'no-cache': { type: 'boolean' },
			help: { type: 'boolean', alias: 'h' },
		},
	})
	_ctx.options.clean = values.clean ?? false
	_ctx.options.verbose = values.verbose ?? false
	_ctx.options.noCache = values['no-cache'] ?? false

	if (!positionals[0]) {
		console.error(helpText)
		consola.error('No command provided.')
		process.exit(1)
	}

	if (values.help) {
		consola.info(helpText)
		process.exit(0)
	}

	/**
	 * Variable _ctx is created at top-level for global type-inference, but we pass it
	 * as a parameter to make testing easier. The top-level variable is prefixed with
	 * an underscore so it is not accidentally used.
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
	await buildSite(ctx, iterateFileQueueByStackframe)
}

async function cliServe(/** @type {Ctx} */ ctx) {
	let bs = null

	const app = createApp()
	const router = createRouter()
	app.use(router)
	router.get(
		'/',
		defineEventHandler((event) => {
			return { message: '⚡️ Tadaa!' }
		}),
	)
	const listener = await listen(toNodeListener(app), {
		port: 3001,
		showURL: false,
	})
	consola.start(`Listening at http://localhost:${listener.address.port} (backend)`)

	initBrowserSync()
	function initBrowserSync() {
		bs = browserSync.create()
		bs.init({
			online: false,
			notify: false,
			open: false,
			minify: false,
			ui: false,
			server: {
				baseDir: ctx.config.outputDir,
				serveStaticOptions: {
					extensions: ['html'],
				},
			},
			...(ctx.options.verbose ? {} : { logLevel: 'silent' }),
			callbacks: {
				ready(err, bs) {
					if (err) throw err

					if (!ctx.options.verbose) {
						const port = bs.getOption('port')
						consola.start(`Listening at http://localhost:${port}`)
					}
				},
			},
		})
	}

	const watcher = chokidar.watch(
		[
			ctx.config.contentDir,
			ctx.config.layoutDir,
			ctx.config.partialsDir,
			ctx.config.staticDir,
		],
		{
			persistent: true,
			ignoreInitial: true,
		},
	)

	watcher
		.on('add', async (inputFile) => {
			await onChangedFile(ctx, inputFile)
		})
		.on('change', async (inputFile) => {
			await onChangedFile(ctx, inputFile)
		})
		.on('error', (error) => {
			consola.error(`Watcher error: ${error}`)
		})

	process.on('SIGINT', async () => {
		bs.exit()
		await listener.close()
		await watcher.close()

		consola.info('Cleaned up.')
		process.exit(0)
	})

	await buildSite(ctx, iterateFileQueueByCallback.bind({ bs }))
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

async function buildSite(
	/** @type {Ctx} */ ctx,
	/** @type {(ctx: Ctx) => Promise<void>} */ processQueueFn,
) {
	{
		const handlebars = handlebarsImport.create()
		// const handlebars = ctx.singletons.handlebars

		// Re-register partials.
		for (const partial in handlebars.partials) {
			handlebars.unregisterPartial(partial)
		}
		try {
			for (const partialFilename of await fs.readdir(ctx.config.partialsDir)) {
				const partialContent = await fs.readFile(
					path.join(ctx.config.partialsDir, partialFilename),
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

	if (ctx.options.clean) {
		consola.info('Clearing build directory...')
		try {
			await fs.rm(ctx.config.outputDir, { recursive: true })
		} catch (err) {
			if (err.code !== 'ENOENT') throw err
		}
	}

	await addAllToFileQueue(ctx)
	await processQueueFn(ctx)

	/**
	 * Copy static files
	 */
	try {
		await fs.cp(ctx.config.staticDir, ctx.config.outputDir, {
			recursive: true,
		})
	} catch (err) {
		if (err.code !== 'ENOENT') throw err
	}

	consola.success('Done.')
}

async function iterateFileQueueByCallback(/** @type {Ctx} */ ctx) {
	await cb()

	async function cb() {
		if (FileQueue.length > 0) {
			await handleContentFile(ctx, FileQueue[0])
			FileQueue.splice(0, 1)
		} else {
			if (this.bs) {
				this.bs.reload()
			}
		}

		setImmediate(cb)
	}
}
async function iterateFileQueueByStackframe(/** @type {Ctx} */ ctx) {
	while (FileQueue.length > 0) {
		await handleContentFile(ctx, FileQueue[0])
		FileQueue.splice(0, 1)
	}
}

async function handleContentFile(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputFile,
) {
	const inputFileUri = path.relative(ctx.config.rootDir, inputFile)

	// A content file is an `inputFile` that is the entrypoint for a particular page route.
	const entrypoint = await (async () => {
		const dirname = path.basename(path.dirname(inputFile))
		const files = [
			path.join(path.dirname(inputFile), 'index.md'),
			path.join(path.dirname(inputFile), 'index.html'),
			path.join(path.dirname(inputFile), 'index.xml'),
			path.join(path.dirname(inputFile), dirname + '.md'),
			path.join(path.dirname(inputFile), dirname + '.html'),
			path.join(path.dirname(inputFile), dirname + '.xml'),
			path.join(path.dirname(inputFile), dirname),
		]

		// Search for a valid content file in the same directory.
		for (const file of files) {
			if (['.md', '.html', '.xml'].includes(path.parse(file).ext)) {
				try {
					await fs.stat(file)
					return file
				} catch {}
			}
		}

		return null
	})()

	let contentForm = /** @type {ContentForm} */ (inputFileUri.slice('content/'.length))
	contentForm = /** @type {ContentForm} */ (
		contentForm.slice(0, contentForm.indexOf('/'))
	)

	if (inputFile != entrypoint) {
		await handleNonEntrypoint(ctx, inputFile, inputFileUri, entrypoint, contentForm)
	}

	if (entrypoint) {
		await handleEntrypoint(ctx, entrypoint, contentForm)
	} else {
		consola.warn(`No content file found for ${inputFileUri}`)
	}
}

async function handleEntrypoint(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ entrypoint,
	/** @type {ContentForm} */ contentForm,
) {
	const entrypointUri = path.relative(ctx.config.rootDir, entrypoint)
	const entrypointUriTransformed = ctx.config.transformOutputUri(entrypointUri)

	const lastModified = (await fs.stat(entrypoint)).mtimeMs
	if (Cache[entrypointUri]?.lastModified >= lastModified && !ctx.options.noCache) {
		consola.log(`Using cached ${entrypointUri}...`)
		return
	}

	let module = {}
	try {
		const javascriptFile = path.join(
			path.dirname(entrypoint),
			path.parse(entrypoint).base + '.rho.js',
		)
		module = await import(javascriptFile)
	} catch (err) {
		if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err
	}

	consola.log(`Processing ${entrypointUri}...`)
	if (entrypoint?.endsWith('.md')) {
		let markdown = await fs.readFile(entrypoint, 'utf-8')
		const { html, frontmatter } = (() => {
			let frontmatter = {}
			markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
				frontmatter = TOML.parse(toml)
				return ''
			})

			return {
				html: MarkdownItInstance.render(markdown),
				frontmatter: ctx.config.validateFrontmatter(entrypoint, frontmatter, contentForm),
			}
		})()

		const layout = frontmatter.layout
			? await fs.readFile(path.join(ctx.config.layoutDir, frontmatter.layout), 'utf-8')
			: await ctx.config.getLayout(entrypointUri, contentForm)
		const template = ctx.singletons.handlebars.compile(layout, {
			noEscape: true,
		})
		const templatedHtml = template({
			__title: frontmatter.title,
			__body: html,
			__inputUri: entrypointUri,
		})

		const relPart =
			frontmatter.slug ?? path.basename(path.dirname(entrypointUriTransformed))
		const outputUri = getOutputUriPart(entrypointUriTransformed, relPart)
		const outputFile = path.join(ctx.config.outputDir, outputUri)
		await fs.mkdir(path.dirname(outputFile), { recursive: true })
		await fs.writeFile(outputFile, templatedHtml)
		consola.log(`  -> Written to ${outputUri}`)
	} else if (entrypoint?.endsWith('.html') || entrypoint?.endsWith('.xml')) {
		let html = await fs.readFile(entrypoint, 'utf-8')
		if (module.GenerateSlugMapping) {
			const slugMap = (await module?.GenerateSlugMapping(ctx.config, ctx.helpers)) ?? []
			for (const slug of slugMap) {
				const data =
					(await module?.GenerateTemplateVariables?.(ctx.config, ctx.helpers, slug)) ?? {}
				await writeHtmlEndpoint(data)
			}
		} else {
			const data =
				(await module?.GenerateTemplateVariables?.(ctx.config, ctx.helpers, {})) ?? {}
			await writeHtmlEndpoint(data)
		}

		async function writeHtmlEndpoint(data = {}) {
			const template = ctx.singletons.handlebars.compile(html, {
				noEscape: true,
			})
			let templatedHtml = template({
				...data,
				__inputUri: entrypointUri,
			})
			const meta = await module?.Meta?.()
			const header = await module?.Header?.(ctx.config, ctx.helpers, {})
			const layout1 = await ctx.config.getLayout(entrypointUri, contentForm)
			let layoutContent
			if (layout1 instanceof Buffer) {
				layoutContent = layout1.toString()
			} else {
				const layoutFilename =
					meta?.layout ?? null ?? ctx?.defaults?.layout ?? 'default.hbs'
				layoutContent = await fs.readFile(
					path.join(ctx.config.layoutDir, layoutFilename),
					'utf-8',
				)
			}

			templatedHtml = ctx.singletons.handlebars.compile(layoutContent, {
				noEscape: true,
			})({
				__body: templatedHtml,
				__header_title: header?.title ?? ctx?.defaults?.title ?? 'Website',
				__header_content: header?.content ?? '',
				__inputUri: entrypointUri,
			})

			const relPart = path.basename(path.dirname(entrypointUriTransformed))
			const outputUri = getOutputUriPart(entrypointUriTransformed, relPart)
			const outputFile = path.join(ctx.config.outputDir, outputUri)
			await fs.mkdir(path.dirname(outputFile), { recursive: true })
			await fs.writeFile(outputFile, templatedHtml)
			consola.log(`  -> Written to ${outputUri}`)
		}
	}

	Cache[entrypointUri] ??= {}
	Cache[entrypointUri].lastModified = lastModified
	await fs.mkdir(path.dirname(ctx.config.cacheFile), { recursive: true })
	await fs.writeFile(ctx.config.cacheFile, JSON.stringify(Cache, null, '\t'))
}

async function handleNonEntrypoint(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputFile,
	/** @type {string} */ inputFileUri,
	/** @type {string | null} */ entrypoint,
	/** @type {ContentForm} */ contentForm,
) {
	if (inputFile.endsWith('.rho.js')) {
		const maybeEntrypoint = inputFile.slice(0, inputFile.length - '.rho.js'.length)

		try {
			await fs.stat(maybeEntrypoint)
			return maybeEntrypoint
		} catch (err) {
			if (err.code === 'ENOENT') {
				throw new Error(
					`Expected to find entrypoint ${path.basename(maybeEntrypoint)} adjacent to JavaScript file: ${inputFile}`,
				)
			} else {
				throw err
			}
		}
	} else {
		const frontmatter = await (async () => {
			if (!entrypoint) return {}

			let markdown
			try {
				markdown = await fs.readFile(entrypoint, 'utf-8')
			} catch {
				return {}
			}

			let frontmatter = {}
			markdown = markdown.replace(/^\+\+\+$(.*)\+\+\+$/ms, (_, toml) => {
				frontmatter = TOML.parse(toml)
				return ''
			})
			return ctx.config.validateFrontmatter(inputFile, frontmatter, contentForm)
		})()
		const inputFileUriTransformed = ctx.config.transformOutputUri(inputFileUri)
		const relPart =
			frontmatter.slug ?? path.basename(path.dirname(inputFileUriTransformed))
		const outputUri = getOutputUriPart(inputFileUriTransformed, relPart)
		const outputFile = path.join(ctx.config.outputDir, outputUri)
		await fs.mkdir(path.dirname(outputFile), { recursive: true })
		await fs.copyFile(inputFile, outputFile)
	}
}

async function addAllToFileQueue(/** @type {Ctx} */ ctx) {
	await walk(ctx.config.contentDir)
	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (entry.name === 'drafts') return // TODO

				const subdir = path.join(dir, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(entry.parentPath, entry.name)
				FileQueue.push(inputFile)
			}
		}
	}
}

/**
 * When a file is changed, process all dependents to update `build/`
 * directory with the most recent content
 */
async function onChangedFile(/** @type {Ctx} */ ctx, /** @type {string} */ inputFile) {
	FileQueue.splice(0, FileQueue.length)
	const inputFileUri = path.relative(ctx.config.rootDir, inputFile)
	if (inputFileUri.startsWith('content/')) {
		FileQueue.push(inputFile)
	} else {
		await addAllToFileQueue(ctx)
	}
}

function getOutputUriPart(/** @type {string} */ uri, /** @type {string} */ relPart) {
	const dirname = path.basename(path.dirname(uri))
	const beforeDirnamePart = path.dirname(path.dirname(uri))

	// If `dirname` is a "file".
	if (dirname.includes('.')) {
		return path.join(beforeDirnamePart, path.parse(uri).base)
	}

	if (!uri.endsWith('.html') && !uri.endsWith('.md')) {
		return path.join(beforeDirnamePart, relPart, path.parse(uri).base)
	}

	if (path.parse(uri).name === dirname) {
		return path.join(beforeDirnamePart, relPart, 'index.html')
	}

	return path.join(beforeDirnamePart, relPart, path.parse(uri).name + '.html')
}
