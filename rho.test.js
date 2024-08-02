import { test, suite, mock, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import handlebarsImport from 'handlebars'
import { execa } from 'execa'
import dedent from 'dedent'

import { commandBuild, consola } from './rho.js'

const Filename = new URL(import.meta.url).pathname
const Dirname = path.dirname(Filename)
const TestDataDir = path.join(Dirname, './testdata')
const OriginalCwd = process.cwd()
const Ctx = Object.freeze({
	singletons: {
		handlebars: handlebarsImport.create(),
	},
	defaults: {
		rootDir: TestDataDir,
		buildJsFile: path.join(Dirname, 'rho.js'),
		cacheFile: path.join(TestDataDir, '.cache/cache.json'),
		contentDir: path.join(TestDataDir, 'content'),
		layoutDir: path.join(TestDataDir, 'layouts'),
		partialsDir: path.join(TestDataDir, 'partials'),
		staticDir: path.join(TestDataDir, 'static'),
		outputDir: path.join(TestDataDir, 'build'),
	},
	options: {
		clean: false,
		verbose: false,
		noCache: true,
	},
	config: {
		customUriTransform(/** @type {string} */ uri) {
			return uri
		},
		getLayout(
			/** @type {Record<PropertyKey, unknown>} */ frontmatter,
			/** @type {ContentForm} */ contentForm,
		) {
			return Buffer.from(
				dedent`
					<!DOCTYPE html>
					<html>
					<head>
						<meta charset="UTF-8">
						<meta name="viewport" content="width=device-width, initial-scale=1.0">
					</head>
					<body>
						{{__body}}
					</body>
					</html>`,
			)
		},
		validateFrontmatter(
			/** @type {string} */ inputFile,
			/** @type {Partial<Frontmatter>} */ frontmatter,
			/** @type {ContentForm} */ contentForm,
		) {
			return frontmatter
		},
	},
})

before(async () => {
	consola.mockTypes(() => mock.fn())
	await fs.rm(TestDataDir, { recursive: true, force: true })
})

beforeEach(async () => {
	await fs.mkdir(TestDataDir, { recursive: true })
	process.chdir(TestDataDir)
})

afterEach(async () => {
	process.chdir(OriginalCwd)
	await fs.rm(TestDataDir, { recursive: true, force: true })
})

suite('entrypoint files are found', async () => {
	test('test/index.md', async () => {
		await writeFiles({
			'./content/test/index.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					+++
					water`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/test/index.html': /<p>water/,
		})
	})

	test('test/index.md with slug', async () => {
		await writeFiles({
			'./content/test/index.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					slug = 'my-slug'
					+++
					water`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/my-slug/index.html': /<p>water/,
		})
	})

	test('test/test.md', async () => {
		await writeFiles({
			'./content/test/test.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					+++
					Bravo`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/test/index.html': /<p>Bravo/,
		})
	})

	test('test/test.md with slug', async () => {
		await writeFiles({
			'./content/test/test.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					slug = 'my-slug'
					+++
					Bravo`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/my-slug/index.html': /<p>Bravo/,
		})
	})
})

suite('html tests', async () => {
	test('test/index.html', async () => {
		await writeFiles({
			'./content/test/index.html': dedent`
					<p>water</p>`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/test/index.html': /<p>water/,
		})
	})

	test('test/index.html with slug', async () => {
		await writeFiles({
			'./content/test/index.html': dedent`
					<p>water</p>`,
			'./content/test/index.html.rho.js': dedent`
					export function Meta() {
						return {
							slug: 'my-slug'
						}
					}`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/my-slug/index.html': /<p>water/,
		})
	})

	test('test/test.html', async () => {
		await writeFiles({
			'./content/test/test.html': dedent`
					<p>Bravo</p>`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/test/index.html': /<p>Bravo/,
		})
	})

	test('test/test.html with slug', async () => {
		await writeFiles({
			'./content/test/test.html': dedent`
					<p>Bravo</p>`,
			'./content/test/test.html.rho.js': dedent`
					export function Meta() {
						return {
							slug: 'my-slug'
						}
					}`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/my-slug/index.html': /<p>Bravo/,
		})
	})
})

async function debugTestDir() {
	console.log('Entering debugging shell...')
	try {
		await execa('bash', { stdio: 'inherit' })
	} catch {}
}

async function writeFiles(/** @type {Record<string, string>} */ fileObject) {
	let /** @type {Promise<void>[]} */ promises = []
	for (const filename in fileObject) {
		promises.push(fs.mkdir(path.dirname(filename), { recursive: true }))
	}
	await Promise.all(promises)

	promises = []
	for (const filename in fileObject) {
		promises.push(fs.writeFile(filename, fileObject[filename]))
	}
	await Promise.all(promises)
}

async function assertFiles(/** @type {Record<string, string>} */ assertObject) {
	for (const filename in assertObject) {
		await test(`File: ${filename}`, async (t) => {
			try {
				await fs.stat(filename)
			} catch (err) {
				if (err.code === 'ENOENT') {
					assert.fail(`File ${filename} does not exist`)
				} else {
					throw err
				}
			}

			const content = await fs.readFile(filename, 'utf8')

			if (typeof assertObject[filename] === 'string') {
				assert.equal(content, assertObject[filename].trim())
			} else if (assertObject[filename] instanceof RegExp) {
				assert.ok(assertObject[filename].test(content))
			} else {
				throw new Error(`User-supplied assert object could not be evaluated`)
			}
		})

		break
	}
}
