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
import {
	createApp,
	createError,
	createRouter,
	defineEventHandler,
	setResponseStatus,
	toNodeListener,
} from 'h3'

import { ctx as _ctx } from './rho.config.js'
import { markedLinks } from './rho.marked.js'

export { consola }

/**
 * @typedef {typeof _ctx} Ctx
 *
 * @typedef {'pages' | 'posts' | 'thoughts' | 'til'} ContentForm
 *
 * @typedef {'build' | 'watch' | 'serve' | 'check'} Subcommands
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
 * @property {ContentForm} contentForm
 * @property {RhoJs} rhoJs
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
const Cache = await (async () => {
	try {
		const text = await fs.readFile(_ctx.defaults.cacheFile, 'utf-8')
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
const /** @type {Map<string, string>} */ FileMap = new Map()
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
	const helpText = `${path.basename(Filename)} <build | watch | serve | check> [options]
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
	_ctx.options.command = /** @type {Subcommands} */ (positionals[0])
	_ctx.options.clean = values.clean ?? false
	_ctx.options.verbose = values.verbose ?? false
	_ctx.options.noCache = values['no-cache'] ?? false

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
	} else if (ctx.options.command === 'watch') {
		await commandWatch(ctx)
	} else if (ctx.options.command === 'build') {
		await commandBuild(ctx)
	} else if (ctx.options.command === 'check') {
		await commandCheck(ctx)
	} else {
		console.error(helpText)
		consola.error(`Unknown command: ${positionals[0]}`)
		process.exit(1)
	}
}

async function commandServe(/** @type {Ctx} */ ctx) {
	await fsRegisterHandlebarsHelpers(ctx)
	await fsPopulateFileMap(ctx)
	console.log(FileMap)

	const app = createApp()
	const router = createRouter()
	app.use(router)
	router.get(
		'/',
		defineEventHandler((event) => {
			const path = event.path
			if (FileMap.has(path)) {
				return { message: 'Found' }
			} else {
				setResponseStatus(event, 404)
				return { error: `Path does not exist: ${path}` }
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

async function commandWatch(/** @type {Ctx} */ ctx) {
	const bs = browserSync.create()
	bs.init({
		online: false,
		notify: false,
		open: false,
		minify: false,
		ui: false,
		server: {
			baseDir: ctx.defaults.outputDir,
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

	const watcher = chokidar.watch(
		[
			ctx.defaults.contentDir,
			ctx.defaults.layoutDir,
			ctx.defaults.partialsDir,
			ctx.defaults.staticDir,
		],
		{
			persistent: true,
			ignoreInitial: true,
		},
	)
	watcher
		.on('add', async (inputFile) => {
			await onChangedFile(ctx, inputFile)
			await fsCopyStaticFiles(ctx)
		})
		.on('change', async (inputFile) => {
			await onChangedFile(ctx, inputFile)
			await fsCopyStaticFiles(ctx)
		})
		.on('error', (error) => {
			consola.error(`Watcher error: ${error}`)
		})

	process.on('SIGINT', async () => {
		bs.exit()
		await watcher.close()

		consola.info('Cleaned up.')
		process.exit(0)
	})

	if (ctx.options.clean) {
		await fsClearBuildDirectory(ctx)
	}
	await fsRegisterHandlebarsHelpers(ctx)
	await addAllContentFilesToFileQueue(ctx)
	await iterateFileQueueByCallback(ctx, {
		onEmptyFileQueue() {
			consola.success('Done.')
			bs.reload()
		},
	})
	await fsCopyStaticFiles(ctx)

	/**
	 * When a file is changed, process all dependents to update `build/`
	 * directory with the most recent content
	 */
	async function onChangedFile(/** @type {Ctx} */ ctx, /** @type {string} */ inputFile) {
		FileQueue.splice(0, FileQueue.length)
		const inputFileUri = path.relative(ctx.defaults.rootDir, inputFile)

		if (
			inputFileUri.startsWith(
				path.relative(ctx.defaults.rootDir, ctx.defaults.contentDir),
			)
		) {
			FileQueue.push(inputFile)
		} else {
			await addAllContentFilesToFileQueue(ctx)
		}
	}
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

async function commandCheck(/** @type {Ctx} */ ctx) {
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

async function iterateFileQueueByCallback(
	/** @type {Ctx} */ ctx,
	{ onEmptyFileQueue = /** @type {() => void | Promise<void>} */ () => {} } = {},
) {
	let lastCallbackWasEmpty = false
	await cb()

	async function cb() {
		if (FileQueue.length > 0) {
			await handleContentFile(ctx, FileQueue[0])
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
		await handleContentFile(ctx, FileQueue[0])
		FileQueue.splice(0, 1)
	}
}

async function handleContentFile(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputFile,
) {
	const inputUri = path.relative(ctx.defaults.rootDir, inputFile)

	// TODO: Phase out content form?
	let contentForm = /** @type {ContentForm} */ (inputUri.slice('content/'.length))
	contentForm = /** @type {ContentForm} */ (
		contentForm.slice(0, contentForm.indexOf('/'))
	)

	const entrypointUri = await utilGetEntrypointFromInputUri(ctx, inputFile)
	const rhoJs = await utilExtractRhoJs(ctx, entrypointUri)
	const outputUri = await convertInputUriToOutputUri(
		ctx,
		inputUri,
		rhoJs,
		entrypointUri,
		contentForm,
	)

	const page = {
		inputFile,
		inputUri,
		outputUri,
		entrypointUri,
		contentForm,
		rhoJs,
	}

	if (inputUri != entrypointUri) {
		await handleNonEntrypoint(ctx, page)
	} else if (entrypointUri) {
		// TODO: handle entrypoint in watch mode?
		await handleEntrypoint(ctx, page)
	} else {
		consola.warn(`No content file found for ${inputUri}`)
	}
}

async function handleEntrypoint(/** @type {Ctx} */ ctx, /** @type {Page} */ page) {
	const lastModified = (
		await fs.stat(path.join(ctx.defaults.rootDir, page.entrypointUri))
	).mtimeMs
	if (Cache[page.entrypointUri]?.lastModified >= lastModified && !ctx.options.noCache) {
		consola.log(`Using cached ${page.entrypointUri}...`)
		return
	}

	consola.log(`Processing ${page.entrypointUri}...`)
	if (
		// prettier-ignore
		page.inputFile.includes('/_') ||
		page.inputFile.includes('_/')
	) {
		// Do not copy file.
	} else if (page.entrypointUri.endsWith('.md')) {
		let markdown = await fs.readFile(
			path.join(ctx.defaults.rootDir, page.entrypointUri),
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
					path.join(ctx.defaults.rootDir, page.entrypointUri),
					frontmatter,
					page.contentForm,
				),
			}
		})()

		const layout = await utilExtractLayout(ctx, [
			frontmatter?.layout,
			await ctx.config.getLayout(page.entrypointUri, page.contentForm),
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

		const outputFile = path.join(ctx.defaults.outputDir, page.outputUri)
		await fs.mkdir(path.dirname(outputFile), { recursive: true })
		await fs.writeFile(outputFile, templatedHtml)
		consola.log(`  -> Written to ${page.outputUri}`)
	} else if (
		page.entrypointUri.endsWith('.html') ||
		page.entrypointUri.endsWith('.xml')
	) {
		let html = await fs.readFile(
			path.join(ctx.defaults.rootDir, page.entrypointUri),
			'utf-8',
		)
		if (page.rhoJs.GenerateSlugMapping) {
			const slugMap = (await page.rhoJs.GenerateSlugMapping(ctx)) ?? []
			const originalOutputUri = page.outputUri
			for (const slug of slugMap) {
				const data =
					(await page.rhoJs?.GenerateTemplateVariables?.(ctx, {
						slug: slug.slug,
						count: slug.count,
					})) ?? {}
				console.log(page.outputUri)
				page.outputUri = path.join(
					path.dirname(originalOutputUri),
					slug.slug,
					'index.html',
				)
				await writeHtmlEndpoint(data)
			}
		} else {
			const data = (await page.rhoJs?.GenerateTemplateVariables?.(ctx, {})) ?? {}
			await writeHtmlEndpoint(data)
		}

		async function writeHtmlEndpoint(data = {}) {
			const template = ctx.singletons.handlebars.compile(html, {
				noEscape: true,
			})
			let templatedHtml = template({
				...data,
				__inputUri: page.entrypointUri,
			})
			const meta = await page.rhoJs?.Meta?.()
			const header = await page.rhoJs?.Header?.(ctx)
			const layout = await utilExtractLayout(ctx, [
				meta?.layout,
				await ctx.config.getLayout(page.entrypointUri ?? '', page.contentForm),
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

			const outputFile = path.join(ctx.defaults.outputDir, page.outputUri)
			await fs.mkdir(path.dirname(outputFile), { recursive: true })
			await fs.writeFile(outputFile, templatedHtml)
			consola.log(`  -> Written to ${page.outputUri}`)
		}
	}

	Cache[page.entrypointUri] ??= {}
	Cache[page.entrypointUri].lastModified = lastModified
	await fs.mkdir(path.dirname(ctx.defaults.cacheFile), { recursive: true })
	await fs.writeFile(ctx.defaults.cacheFile, JSON.stringify(Cache, null, '\t'))
}

async function handleNonEntrypoint(/** @type {Ctx} */ ctx, /** @type {Page} */ page) {
	if (
		page.inputFile.includes('/_') ||
		page.inputFile.includes('_/') ||
		path.parse(page.inputFile).name.endsWith('_') ||
		page.inputFile.endsWith('.rho.js')
	) {
		// Do not copy file.
	} else {
		const outputFile = path.join(ctx.defaults.outputDir, page.outputUri)
		await fs.mkdir(path.dirname(outputFile), { recursive: true })
		await fs.copyFile(page.inputFile, outputFile)
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

async function fsPopulateFileMap(/** @type {Ctx} */ ctx) {
	await walk(ctx.defaults.contentDir)
	async function walk(/** @type {string} */ dir) {
		for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const subdir = path.join(entry.parentPath, entry.name)
				await walk(subdir)
			} else if (entry.isFile()) {
				const inputFile = path.join(entry.parentPath, entry.name)
				const inputUri = path.relative(ctx.defaults.rootDir, inputFile)
				const entrypointUri = await utilGetEntrypointFromInputUri(ctx, inputFile)
				const rhoJs = await utilExtractRhoJs(ctx, entrypointUri)
				const outputUri = await convertInputUriToOutputUri(
					ctx,
					inputUri,
					rhoJs,
					entrypointUri,
				)
				FileMap.set(outputUri, inputFile)
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
				FileQueue.push(inputFile)
			}
		}
	}
}

async function convertInputUriToOutputUri(
	/** @type {Ctx} */ ctx,
	/** @type {string} */ inputUri,
	/** @type {RhoJs} */ rhoJs,
	/** @type {string | null} */ entrypointUri,
	/** @type {ContentForm} */ contentForm,
) {
	const inputFile = path.join(ctx.defaults.rootDir, inputUri)
	inputUri = path.relative(ctx.defaults.contentDir, inputFile)
	inputUri = ctx.config.customUriTransform(inputUri)

	// For an `inputFile` of `/a/b/c.txt`, this extracts `/a`.
	const pathPart = path.dirname(path.dirname(inputUri))
	// For an `inputFile` of `/a/b/c.txt`, this extracts `b`.
	const parentDirname = path.basename(path.dirname(inputUri))

	// If `parentDirname` is a "file".
	if (parentDirname.includes('.') && parentDirname !== '.') {
		return path.join(pathPart, path.parse(inputUri).base)
	} else if (!inputUri.endsWith('.html') && !inputUri.endsWith('.md')) {
		const relPart = await getNewParentDirname(ctx, inputUri, contentForm)
		return path.join(pathPart, relPart, path.parse(inputUri).base)
	} else if (path.parse(inputUri).name === parentDirname) {
		const parentDirname = await getNewParentDirname(ctx, inputUri, contentForm)
		return path.join(pathPart, parentDirname, 'index.html')
	} else {
		const relPart = await getNewParentDirname(ctx, inputUri, contentForm)
		return path.join(pathPart, relPart, path.parse(inputUri).name + '.html')
	}

	async function getNewParentDirname(
		/** @type {Ctx} */ ctx,
		/** @type {string} */ inputUri,
		/** @type {ContentForm} */ contentForm,
	) {
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
				contentForm,
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
	/** @type {ContentForm} */ contentForm,
) {
	if (!inputFile) return {}
	const entrypointFile = path.join(ctx.defaults.rootDir, entrypointUri)

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

	return /** @type {ContentForm} */ (
		ctx.config.validateFrontmatter(entrypointFile, frontmatter, contentForm)
	)
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
	const entrypointFile = path.join(ctx.defaults.rootDir, entrypointUri)

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

	// Search for a valid content file in the same directory.
	for (const uri of fileUris) {
		const file = path.join(path.dirname(inputFile), uri)
		if (['.md', '.html', '.xml'].includes(path.parse(uri).ext)) {
			try {
				await fs.stat(file)
				return path.relative(ctx.defaults.rootDir, file)
			} catch {}
		}
	}

	throw new Error(`No entrypoint found for file: ${inputFile}`)
}
