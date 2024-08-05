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

suite('.md entrypoint works', async () => {
	test('index.md', async () => {
		await writeFiles({
			'./content/index.md': dedent`
					+++
					title = 'Title'
					author = 'First Last'
					date = 2000-01-01
					+++
					water`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/index.html': /<p>water/,
		})
	})

	// TODO: should error
	// test('index.md with slug', async () => {
	// 	await writeFiles({
	// 		'./content/index.md': dedent`
	// 				+++
	// 				title = 'Title'
	// 				author = 'First Last'
	// 				date = 2000-01-01
	// 				slug = 'my-slug'
	// 				+++
	// 				water`,
	// 	})
	// 	await commandBuild(Ctx)

	// 	await assertFiles({
	// 		'./build/my-slug/index.html': /<p>water/,
	// 	})
	// })

	test('test/index.md', async () => {
		await writeFiles({
			'./content/test/index.md': dedent`
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

	test('test/index.md with slug', async () => {
		await writeFiles({
			'./content/test/index.md': dedent`
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

suite('.html entrypoint works', async () => {
	test('index.html', async () => {
		await writeFiles({
			'./content/index.html': dedent`
					<p>water</p>`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/index.html': /<p>water/,
		})
	})

	// TODO: should error
	// test('index.html with slug', async () => {
	// 	await writeFiles({
	// 		'./content/index.html': dedent`
	// 				<p>water</p>`,
	// 		'./content/index.html.rho.js': dedent`
	// 				export function Meta() {
	// 					return {
	// 						slug: 'my-slug'
	// 					}
	// 				}`,
	// 	})
	// 	await commandBuild(Ctx)

	// 	await assertFiles({
	// 		'./build/my-slug/index.html': /<p>water/,
	// 	})
	// })

	test('test/index.html', async () => {
		await writeFiles({
			'./content/test/index.html': dedent`
					<p>Bravo</p>`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/test/index.html': /<p>Bravo/,
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

	test('test/index.html with slug', async () => {
		await writeFiles({
			'./content/test/index.html': dedent`
					<p>Bravo</p>`,
			'./content/test/index.html.rho.js': dedent`
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

suite('content is correctly (not-)?copied', async () => {
	test('index.html and style.css are copied', async () => {
		await writeFiles({
			'./content/index.html': dedent`
					<p>water</p>`,
			'./content/style.css': dedent`
					p { font-size: 16px; }`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/index.html': /<p>water/,
			'./build/style.css': /font-size: 16px/,
		})
	})

	test('index.html.rho.js is skipped', async () => {
		await writeFiles({
			'./content/index.html': dedent`
					<p>water</p>`,
			'./content/index.html.rho.js': dedent`
					export function Meta() {}`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/index.html': /<p>water/,
			'./build/index.html.rho.js': null,
		})
	})

	test('test/test.html.rho.js is skipped', async () => {
		await writeFiles({
			'./content/test/test.html': dedent`
					<p>water</p>`,
			'./content/test/test.html.rho.js': dedent`
					export function Meta() {}`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/test/index.html': /<p>water/,
			'./build/test/index.html.rho.js': null,
		})
	})

	test('test.html/test.html.rho.js is skipped', async () => {
		await writeFiles({
			'./content/test.html/test.html': dedent`
					<p>water</p>`,
			'./content/test.html/test.html.rho.js': dedent`
					export function Meta() {}`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/test.html': /<p>water/,
			'./build/test.html.rho.js': null,
		})
	})

	test('style_.css is skipped', async () => {
		await writeFiles({
			'./content/index.html': dedent`
					<p>water</p>`,
			'./content/style_.css': dedent`
					p { font-size: 16px; }`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/index.html': /<p>water/,
			'./build/style_.css': null,
		})
	})

	test('_style.css is skipped', async () => {
		await writeFiles({
			'./content/index.html': dedent`
					<p>water</p>`,
			'./content/_style.css': dedent`
					p { font-size: 16px; }`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/index.html': /<p>water/,
			'./build/_style.css': null,
		})
	})

	test('dir_/* is skipped', async () => {
		await writeFiles({
			'./content/dir_/index.html': dedent`
					<p>water</p>`,
			'./content/dir_/style.css': dedent`
					p { font-size: 16px; }`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/dir_/index.html': null,
			'./build/dir_/style.css': null,
		})
	})

	test('_dir/* is skipped', async () => {
		await writeFiles({
			'./content/_dir/index.html': dedent`
					<p>water</p>`,
			'./content/_dir/style.css': dedent`
					p { font-size: 16px; }`,
		})
		await commandBuild(Ctx)

		await assertFiles({
			'./build/_dir/index.html': null,
			'./build/_dir/style.css': null,
		})
	})
})

suite('rho.js', async () => {
	test('index.html.rho.js throws without corresponding index.html', async () => {
		await writeFiles({
			'./content/index.html.rho.js': dedent`
					export function Meta() {}`,
		})

		assertThrownErrorWithMessage('No entrypoint found for file', async () => {
			await commandBuild(Ctx)
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
	for (const [filename, assertValue] of Object.entries(assertObject)) {
		let fileExists = true
		try {
			await fs.stat(filename)
			fileExists = true
		} catch (err) {
			if (err.code === 'ENOENT') {
				fileExists = false
			} else {
				throw err
			}
		}

		if (assertValue !== null) {
			if (fileExists) {
				const content = await fs.readFile(filename, 'utf8')
				if (typeof assertValue === 'string') {
					assert.equal(content, assertValue.trim())
				} else if (assertValue instanceof RegExp) {
					assert.ok(assertValue.test(content))
				} else {
					throw new Error(`User-supplied assert object could not be evaluated`)
				}
			} else {
				assert.fail(`File ${filename} does not exist (but should)`)
			}
		} else {
			if (fileExists) {
				assert.fail(`File ${filename} does exist (but should not)`)
			}
		}
	}
}

async function assertThrownErrorWithMessage(
	/** @type {string} */ errorMessage,
	/** @type {() => void | Promise<void>} */ fn,
) {
	try {
		await fn(Ctx)
		assert.fail('Expected an error to be thrown (nothing was thrown)')
	} catch (err) {
		if (err instanceof Error) {
			if (!err.message.includes(errorMessage)) {
				assert.fail(`Expected thrown error to include the string: ${errorMessage}`)
			}
		} else {
			assert.fail('Expected an error to be thrown (a non-error was thrown')
		}
	}
}
