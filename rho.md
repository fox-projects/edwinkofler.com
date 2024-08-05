# Rho <!-- omit from toc -->

Wedding myself to a third-party static site generator solution limits the degree to which I can customize my website. Rho solves that because it's my software.

## Plans <!-- omit from toc -->

- Made sidebar header responsive
- Fix `drafts` being copied over
- Do not set `layout` in `<file>.md`
- Download fonts and self-host
- Check for `.html.js`, `.md.js`, ask if meant ".html.rho.js"
- Fix "XML" file being an entrypoint. ie, all files should be able to be procesed with a ".rho.js" file.
- Improve logging (add verbose mode)
- Be able to build only certain files/directory matching a glob
- `new` subcommand for making new templates
- later: more tests for `.rho.js`
- later: Make `FileList` a `DirList` (later)
- later: Custom dev server
- later: Replace `browser-sync` with custom solution
- later: Linter to always ensure trailing slash for local URLs

## Introduction <!-- omit from toc -->

- [Entrypoint Content Files](#entrypoint-content-files)
  - [File Formats](#file-formats)
    - [HTML Files](#html-files)
    - [Markdown Files](#markdown-files)
    - [XML Files](#xml-files)
  - [Non-entrypoint Content Files](#non-entrypoint-content-files)
- [JavaScript Customization](#javascript-customization)
- [Directory Structure](#directory-structure)
  - [`build/`](#build)
  - [`content/`](#content)
    - [`content/pages/`](#contentpages)
    - [`content/posts/`](#contentposts)
    - [`content/til/`](#contenttil)
  - [`layouts/`](#layouts)
  - [`partials/`](#partials)
  - [`static/`](#static)

Rho is a static site generator. Conventionally, it reads input files from `content/`; for each file, it is processed, then written to `build/`. When processing each file, it transforms both its path and content.

When walking the content directory, every directory is associated with either a route or file. For each directory, there are two possible types of files: Entrypoint and non-entrypoint files.

## Entrypoint Content Files

These are similar to `index.html` when serving files over the web, or `page.js` in a Next.js project. They define the content generated at a particular route. There are three way to define one:

- `/content/index.html` -> `/build/index.html`
- `/content/about/about.md` -> `/build/about/index.html`
- `/content/index.html/index.html` -> `/build/index.html`

The first way is required. The second way makes it easier to edit files in IDEs. The third way makes it easier to differently group files that are all under the same route.

### File Formats

The following formats are supported:

#### HTML Files

These are processed with the templating engine [Handlebars](https://handlebarsjs.com).

#### Markdown Files

Markdown files support the following features:

- Syntax highlighting (via [Shiki](https://shiki.style))
- Emoji conversion
- KaTeX

#### XML Files

TODO: Fix this

### Non-entrypoint Content Files

These files are files associated with the entrypoint. They are copied to their respective output directory, unless the file matches:

- `*.rho.js`
- `_*`
- `*_`

## JavaScript Customization

- `Meta()`
- `Header()`
- `GenerateSlugMapping()`
- `GenerateTemplateVariables()`

## Directory Structure

Nothing here is out of the ordinary.

### `build/`

Where output files are written to.

### `content/`

User-generated content. There are several variants:

#### `content/pages/`

Contains directories and files that each represent an individual page. For example, the directory `/pages/about` represents `/about/index.html` while the file `pages/index.xml` represents `/index.xml`.

#### `content/posts/`

Contains subdirectories with a dirname of either (1) a year (ex. `2005`) or (2) the value `drafts`. The subdirectories of those subdirectories represent an individual page (ex. `posts/2023/oppenheimer-movie-review`). Drafts are automatically shown when running the development server and automatically hidden when building the blog, unless indicated otherwise by the `--show-drafts` command-line flag.

#### `content/til/`

### `layouts/`

Handlebars templates that are applied to all pages and posts. Individual pages and posts can specify a particular template in the frontmatter using the `layout` property.

### `partials/`

Handlebars partials that can be used in any HTML file.

### `static/`

These assets are copied directly to the build directory without processing.
