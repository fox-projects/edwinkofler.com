# Documentation for `rho.js`

Wedding myself to a third-party static site generator solution limits the degree to which I can customize my website. `rho.js` solves that because I wrote it.

## Plans

- `new` subcommand for making new templates
- Have option to run via dev server (better than `browser-sync`, more options?)
- Dependency: Replace `handlebars` with `liquidjs`
- Dependency: Replace `browser-sync` with custom solution
- Linter to always ensure trailing slash for local URLs

## Concepts

### Leafs

## Directory Structure

Nothing here is out of the ordinary.

### `build/`

Where output files are written to.

### `content/`

User-generated content. There are several variants:

#### `pages/`

Contains directories and files that each represent an individual page. For example, the directory `/pages/about` represents `/about/index.html` while the file `pages/index.xml` represents `/index.xml`.

#### `posts/`

Contains subdirectories with a dirname of either (1) a year (ex. `2005`) or (2) the value `drafts`. The subdirectories of those subdirectories represent an individual page (ex. `posts/2023/oppenheimer-movie-review`). Drafts are automatically shown when running the development server and automatically hidden when building the blog, unless indicated otherwise by the `--show-drafts` command-line flag.

#### `til/`

#### `papers/`

### `layouts/`

Handlebars templates that are applied to all pages and posts. Individual pages and posts can specify a particular template in the frontmatter using the `layout` property.

### `partials/`

Handlebars templates that can be used in any HTML file.

### `static/`

These assets are copied directly to the build directory without processing.

## Page and Post Handling

Pages and posts (like the aforementioned `/pages/about` and `posts/2023/oppenheimer-movie-review`) have a particular directory structure.

The directory must have a "content file" with the same name as the directory name (ex. `/pages/about/about.md` or `/pages/about/about.html`). A JavaScript file with the same name (ex. `/pages/about/about.js`) is treated specially; exporting functions allows for customizing behavior.

All other files are copied over, unprocessed.

### Content Handling

There are three types of content files:

1. **Entrypoint files**

These are treated specially.

3. **Non-entrypoint files**

These are simply copied over.

4. **Rho files**

Contains custom logic; not copied over. End in `.rho.js`.

#### Entrypoint File Transformations

If a file (minus its extension) has the same name as it's parent directory, it's name is changed to `index`. This makes keeping track of files in editors easier:

- `/pages/about/about.md` -> `/about/index.html`

If a file has the same name as it's parent directory (and has a dot), the parent directory is removed. This makes it easy to group logic associated with a particular non-directory route:

- `/pages/index.html/index.html` -> `/index.html`

All other files are copied verbatim:

- `/pages/index.html` -> `/index.html`

#### Entrypoint File Formats

For now, `.html`, `xml`, and `.md` files are supported.

## JavaScript Customization

- `Meta()`
- `Header()`
- `GenerateSlugMapping()`
- `GenerateTemplateVariables()`
