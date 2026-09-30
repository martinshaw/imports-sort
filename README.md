# Imports Sort

A VS Code / Cursor extension that sorts import statements by length — shortest first — while keeping blank-line sections intact.

**Supported languages:** PHP (`use`), JavaScript, JSX, TypeScript, TSX, and Vue (`import` inside `<script>` blocks).

## Sort rules

1. **Shortest line first** (full statement length).
2. **Equal length** → shorter import path wins  
   - PHP: through the `use` path, stopping before `as` / `;`  
   - JS/TS/Vue: through the module specifier
3. **Still tied** → shorter namespace / directory prefix (path without the final segment).
4. **Blank lines** between groups are treated as section breaks; each section is sorted on its own.
5. **CSS imports** (`.css`, `.scss`, `.sass`, `.less`, `.styl`, including `.module.*`) in JS/TS/Vue are moved into one sorted section **below** the other import sections.

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

import './b.css';
import styles from './a.module.css';
```

Non-CSS sections stay separate; CSS imports are collected and sorted at the bottom.

## Install

### From GitHub Releases

Download the latest `.vsix` from [Releases](https://github.com/martinshaw/imports-sort/releases), then:

```bash
cursor --install-extension ./imports-sort-x.y.z.vsix
```

Or use **Extensions: Install from VSIX…** in the Command Palette.

Pushing a `v*` tag (e.g. `v1.1.1`) runs CI: tests, packages the VSIX, and publishes a GitHub Release with the asset attached. You can also re-run packaging for an existing tag via **Actions → Release → Run workflow**.

### From source

```bash
npm install
npm run package
cursor --install-extension ./imports-sort-1.2.2.vsix
```

### Development

1. Open this folder in VS Code / Cursor.
2. Run `npm install` and `npm run compile` (or `npm run watch`).
3. Press **F5** to launch an Extension Development Host.
4. Run **Imports Sort: Sort Imports** from the Command Palette.

## Usage

1. Open a supported file (PHP, Vue, JS, JSX, TS, or TSX).
2. Command Palette → **Imports Sort: Sort Imports**.

Other languages are rejected with a short message.

## Commands

| Command | ID |
| --- | --- |
| Imports Sort: Sort Imports | `importsSort.sort` |

## Scripts

| Script | Description |
| --- | --- |
| `npm run compile` | Compile TypeScript to `out/` |
| `npm run watch` | Compile on change |
| `npm test` | Run sort-logic unit tests |
| `npm run package` | Build a `.vsix` |

## Project layout

```
src/
  extension.ts      # Command registration
  sortImports.ts    # Sorting logic (PHP + ESM + Vue SFC)
  test/             # Node-based unit tests
```

Built with [Cursor](https://cursor.com) AI.
