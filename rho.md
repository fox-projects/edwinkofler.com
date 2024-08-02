# Rho

Wedding myself to a third-party static site generator solution limits the degree to which I can customize my website. Rho solves that because it's my software.

## Plans

- `new` subcommand for making new templates
- Have option to run via dev server (better than `browser-sync`, more options?)
- Dependency: Replace `handlebars` with `liquidjs`
- Dependency: Replace `browser-sync` with custom solution
- Linter to always ensure trailing slash for local URLs

## Introduction

Rho is a static site generator. Conventionally, it reads input files from `content/`; for each file, it is processed, then written to `build/`. When processing each file, it transforms both its path and content.

## Content

When walking the content directory, every directory is associated with either a route or file. For each directory, there are two possible types of files:

### 1. Entrypoint Files

These are similar to `index.js` in, say, a Next project.

#### Entrypoint file possibilities

The first is no surprise; if a file's name (excluding file extension) is `index`, it is considered an entrypoint file.

- `/pages/index.html` -> `/index.html`

If a file (minus its extension) has the same name as it's parent directory, it's name is changed to `index`. This makes keeping track of files in editors easier:

- `/pages/about/about.md` -> `/about/index.html`

If a file has the same name as it's parent directory (and has a dot), the parent directory is removed. This makes it easy to group logic associated with a particular non-directory route:

- `/pages/index.html/index.html` -> `/index.html`

### 2. Non-entrypoint files

These files are files associated with the entrypoint. Sometimes they are copied to the build directory; other times, they are not. They can include:

- `style.css`
- `something.rho.js`

#### Entrypoint File Formats

For now, `.html`, `xml`, and `.md` files are supported.

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
