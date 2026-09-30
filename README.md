# Imports Sort

A VS Code / Cursor extension that sorts import statements by length — shortest first — while keeping blank-line sections intact.

**Supported languages:** PHP (`use`), JavaScript, JSX, TypeScript, TSX, and Vue (`import` inside `<script>` blocks).

**Extension ID:** `martinshaw.imports-sort`  
**License:** [GPL-3.0-only](LICENSE)

## Sort rules

1. **Shortest line first** (full statement length).
2. **Equal length** → shorter import path wins  
   - PHP: through the `use` path, stopping before `as` / `;`  
   - JS/TS/Vue: through the module specifier
3. **Still tied** → shorter namespace / directory prefix (path without the final segment).
4. **Blank lines** between groups are treated as section breaks; each section is sorted on its own.
5. **Type imports** (`import type …`) in JS/TS/Vue are moved into one sorted section **after** other ESM imports (when enabled).
6. **CSS imports** (`.css`, `.scss`, `.sass`, `.less`, `.styl`, including `.module.*`) in JS/TS/Vue are moved into one sorted section **below** the other import sections (when enabled).

### PHP example

```php
use App\Models\User;
use App\Services\JobManagementService;
use App\Repositories\ClientRepository;
```

Equal-length ties use path / namespace prefix length (e.g. `use App\Services` before `use App\Repositories`).

### JS / Vue example

```ts
import { ref } from 'vue';
import Foo from './Foo.vue';

import axios from 'axios';

import type { User } from './types';

import './b.css';
import styles from './a.module.css';
```

Non-special sections stay separate; type imports and CSS imports are collected into their own sections when those settings are enabled.

## Install

### From GitHub Releases

Download the latest `.vsix` from [Releases](https://github.com/martinshaw/imports-sort/releases), then:

```bash
cursor --install-extension ./imports-sort-x.y.z.vsix
```

Or use **Extensions: Install from VSIX…** in the Command Palette.

Pushing a `v*` tag runs CI: tests, packages the VSIX, and publishes a GitHub Release with the asset attached. You can also re-run packaging for an existing tag via **Actions → Release → Run workflow**.

### From source

```bash
npm install
npm run package
cursor --install-extension ./imports-sort-1.2.4.vsix
```

### Development

1. Open this folder in VS Code / Cursor.
2. Run `npm install` and `npm run compile` (or `npm run watch`).
3. Press **F5** to launch an Extension Development Host.
4. Run **Imports Sort: Sort Imports** from the Command Palette.

## Usage

1. Open a supported file (PHP, Vue, JS, JSX, TS, or TSX).
2. Command Palette → **Imports Sort: Sort Imports**, or use the **Sort Imports** code action when the cursor is in the import region.
3. Optionally enable sort-on-save in Settings.

Gitignored files are skipped. Unsupported languages and disabled file extensions are left alone (with a short message for the manual command).

## Commands

| Command | ID | When it runs | What it does |
| --- | --- | --- | --- |
| Imports Sort: Sort Imports | `importsSort.sort` | Command Palette, or the **Sort Imports** code action / lightbulb when the cursor (or selection) intersects the import/`use` region | Sorts and formats imports in the active editor using the current settings. Skips the file if its extension is disabled or the path is gitignored. Shows a status message when there is nothing to change or the language is unsupported. |
| Sort Imports (code action) | uses `importsSort.sort` | Offered automatically in supported languages when the cursor is inside the import region | Same behavior as the command above; appears in the lightbulb / Quick Fix / Source Actions menus. |

## Settings

All settings are under the **Imports Sort** section (`importsSort.*`). Scope: user, workspace, or folder.

| Setting | Type | Default | Explanation |
| --- | --- | --- | --- |
| `importsSort.sortOnSave` | `boolean` | `false` | When `true`, runs the same sort/format pass automatically on save (via `onWillSaveTextDocument`). Still respects file-extension filters and gitignore. |
| `importsSort.fileExtensions` | `string[]` | all supported (`.php`, `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, `.vue`) | Only files whose extension is in this list are processed by the command, sort-on-save, and code action. Untitled buffers without an extension are allowed if any listed extension maps to the editor language. |
| `importsSort.separateTypeImports` | `boolean` | `true` | When `true` (ESM only), moves `import type …` statements into their own blank-line-separated section after other non-CSS imports and before the CSS section. Inline `{ type Foo }` stays with normal imports. When `false`, type imports stay in place and sort with their section. |
| `importsSort.separateCssImports` | `boolean` | `true` | When `true` (ESM only), collects CSS/SCSS/Sass/Less/Stylus (and `.module.*`) imports into one sorted section at the bottom of the import block. When `false`, CSS imports stay in their original sections. |
| `importsSort.quoteStyle` | `"single"` \| `"double"` \| `"detect"` | `"detect"` | Normalizes quotes on ESM module specifiers (`from '…'` / `import '…'`). `single` / `double` force that style; `detect` counts existing specifier quotes in the import region and uses the majority (`'` wins ties). |
| `importsSort.semicolons` | `"always"` \| `"never"` \| `"detect"` | `"detect"` | Normalizes trailing semicolons on import/`use` statements. `always` / `never` force that style; `detect` uses the majority in the import region (semicolon wins ties). |
| `importsSort.collapseMultilineImports` | `boolean` | `false` | When `false`, multi-line named imports keep their line structure (braces are still spaced). When `true`, short named imports are collapsed to one line; named imports that would exceed `collapseMultilineMaxLength` are expanded to a multi-line form instead. |
| `importsSort.collapseMultilineMaxLength` | `number` (≥ 40) | `100` | Preferred max line length used only when `collapseMultilineImports` is enabled. Controls the collapse-vs-expand threshold for named imports. |

## Scripts

| Script | Description |
| --- | --- |
| `npm run compile` | Compile TypeScript to `out/` |
| `npm run watch` | Compile on change |
| `npm test` | Compile, then run sort-logic unit tests |
| `npm run package` | Build a `.vsix` |

## Project layout

```
src/
  extension.ts      # Commands, settings, save hook, code action
  sortImports.ts    # Sorting / formatting logic (PHP + ESM + Vue SFC)
  test/             # Node-based unit tests
```

Built with [Cursor](https://cursor.com) AI.
