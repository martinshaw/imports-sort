/**
 * Sort import/`use` statements: shortest line first; equal length uses
 * path length, then namespace/module prefix length.
 * Blank-line sections are sorted independently and kept separate.
 * In JS/TS/Vue, CSS module imports are moved to one sorted section at the end.
 */

export type ImportKind = 'php' | 'esm';

const CSS_MODULE_RE = /\.(?:module\.)?(?:css|scss|sass|less|styl)$/i;

export function isBlankLine(line: string): boolean {
  return /^\s*$/.test(line);
}

export function isPhpUseStatement(line: string): boolean {
  return /^\s*use\s+/i.test(line);
}

export function isEsmImportStatement(line: string): boolean {
  return /^\s*import\b/.test(line);
}

export function isImportStatement(line: string, kind: ImportKind): boolean {
  return kind === 'php' ? isPhpUseStatement(line) : isEsmImportStatement(line);
}

/** @deprecated use isPhpUseStatement */
export const isUseStatement = isPhpUseStatement;

/** Module specifier inside quotes, if any. */
export function getModuleSpecifier(statement: string): string | null {
  const fromMatch = /\bfrom\s+['"]([^'"]+)['"]\s*;?\s*$/m.exec(statement.trim());
  if (fromMatch) {
    return fromMatch[1];
  }
  const sideEffect = /^import\s+['"]([^'"]+)['"]\s*;?\s*$/m.exec(statement.trim());
  return sideEffect ? sideEffect[1] : null;
}

export function isCssImport(statement: string): boolean {
  const spec = getModuleSpecifier(statement);
  if (!spec) {
    return false;
  }
  // Strip query/hash (e.g. './foo.css?inline')
  const path = spec.split(/[?#]/)[0];
  return CSS_MODULE_RE.test(path);
}

/**
 * Trim trailing `;`. For PHP, also strip ` as Alias`.
 * For ESM, keep through the module specifier (the import path).
 */
export function importPathPortion(line: string, kind: ImportKind = 'php'): string {
  let s = line.trim();
  if (s.endsWith(';')) {
    s = s.slice(0, -1).trimEnd();
  }

  if (kind === 'esm') {
    const fromMatch = /^(.*\bfrom\s+['"][^'"]+['"])/s.exec(s);
    if (fromMatch) {
      return fromMatch[1];
    }
    const sideEffect = /^(import\s+['"][^'"]+['"])/.exec(s);
    if (sideEffect) {
      return sideEffect[1];
    }
    return s;
  }

  const asMatch = /\s+as\s+/i.exec(s);
  if (asMatch && asMatch.index !== undefined) {
    s = s.slice(0, asMatch.index).trimEnd();
  }
  return s;
}

/**
 * Length through the import path/name (before PHP `as` / trailing `;`,
 * or through the ESM module specifier).
 */
export function pathTokensetLength(line: string, kind: ImportKind = 'php'): number {
  return importPathPortion(line, kind).length;
}

/**
 * Length through the namespace / module-directory prefix
 * (everything before the final \ or / segment).
 */
export function namespacePrefixLength(line: string, kind: ImportKind = 'php'): number {
  const portion = importPathPortion(line, kind);

  if (kind === 'esm') {
    const specMatch = /^(.*['"])([^'"]+)(['"])\s*$/.exec(portion);
    if (!specMatch) {
      return portion.length;
    }
    const before = specMatch[1];
    const spec = specMatch[2];
    const lastSep = Math.max(spec.lastIndexOf('/'), spec.lastIndexOf('\\'));
    if (lastSep === -1) {
      return portion.length;
    }
    return before.length + lastSep;
  }

  const match = /^(use\s+(?:function\s+|const\s+)?)(.+)$/i.exec(portion);
  if (!match) {
    return portion.length;
  }
  const keyword = match[1];
  const qualified = match[2];
  const lastSep = qualified.lastIndexOf('\\');
  if (lastSep === -1) {
    return portion.length;
  }
  return keyword.length + lastSep;
}

export function compareImportLines(
  a: string,
  b: string,
  kind: ImportKind = 'php'
): number {
  const lenA = a.trimEnd().length;
  const lenB = b.trimEnd().length;
  if (lenA !== lenB) {
    return lenA - lenB;
  }

  const pathA = pathTokensetLength(a, kind);
  const pathB = pathTokensetLength(b, kind);
  if (pathA !== pathB) {
    return pathA - pathB;
  }

  const nsA = namespacePrefixLength(a, kind);
  const nsB = namespacePrefixLength(b, kind);
  if (nsA !== nsB) {
    return nsA - nsB;
  }

  return a.trim().localeCompare(b.trim());
}

/** @deprecated use compareImportLines */
export function compareUseLines(a: string, b: string): number {
  return compareImportLines(a, b, 'php');
}

export function sortImportSection(
  lines: string[],
  kind: ImportKind = 'php'
): string[] {
  return [...lines].sort((a, b) => compareImportLines(a, b, kind));
}

/** @deprecated use sortImportSection */
export function sortUseSection(lines: string[]): string[] {
  return sortImportSection(lines, 'php');
}

/** Split a contiguous import region into sections separated by blank lines. */
export function splitIntoSections(lines: string[]): string[][] {
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (isBlankLine(line)) {
      if (current.length > 0) {
        sections.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    sections.push(current);
  }
  return sections;
}

function joinSections(sections: string[][]): string[] {
  const result: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (i > 0) {
      result.push('');
    }
    result.push(...sections[i]);
  }
  return result;
}

/**
 * Sort import lines. For ESM, CSS imports are removed from their sections
 * and appended as one sorted section below the rest.
 */
export function sortImportRegion(
  lines: string[],
  kind: ImportKind = 'php'
): string[] {
  if (kind === 'php') {
    const sections = splitIntoSections(lines).map((s) =>
      sortImportSection(s, kind)
    );
    return joinSections(sections);
  }

  const css: string[] = [];
  const sections = splitIntoSections(lines);
  const nonCssSections: string[][] = [];

  for (const section of sections) {
    const kept: string[] = [];
    for (const line of section) {
      if (isCssImport(line)) {
        css.push(line);
      } else {
        kept.push(line);
      }
    }
    if (kept.length > 0) {
      nonCssSections.push(sortImportSection(kept, kind));
    }
  }

  const result = joinSections(nonCssSections);
  if (css.length > 0) {
    if (result.length > 0) {
      result.push('');
    }
    result.push(...sortImportSection(css, kind));
  }
  return result;
}

/** @deprecated use sortImportRegion */
export function sortUseRegion(lines: string[]): string[] {
  return sortImportRegion(lines, 'php');
}

export interface ImportRegion {
  /** Inclusive start line index */
  start: number;
  /** Exclusive end line index */
  end: number;
  lines: string[];
}

/**
 * Find the first contiguous block of import/`use` statements (blank lines
 * allowed as section breaks). Stops at the first non-import, non-blank line.
 */
export function findImportRegion(
  documentLines: string[],
  kind: ImportKind,
  fromIndex = 0,
  toIndex = documentLines.length
): ImportRegion | null {
  let start = -1;

  for (let i = fromIndex; i < toIndex; i++) {
    if (isImportStatement(documentLines[i], kind)) {
      start = i;
      break;
    }
  }

  if (start === -1) {
    return null;
  }

  let end = start;
  for (let i = start; i < toIndex; i++) {
    const line = documentLines[i];
    if (isImportStatement(line, kind) || isBlankLine(line)) {
      if (isImportStatement(line, kind)) {
        end = i + 1;
      }
      continue;
    }
    break;
  }

  return {
    start,
    end,
    lines: documentLines.slice(start, end),
  };
}

/** @deprecated use findImportRegion */
export function findUseRegion(documentLines: string[]): ImportRegion | null {
  return findImportRegion(documentLines, 'php');
}

function applySortedRegion(
  lines: string[],
  region: ImportRegion,
  kind: ImportKind
): { lines: string[]; changed: boolean } {
  const sorted = sortImportRegion(region.lines, kind);
  const unchanged =
    sorted.length === region.lines.length &&
    sorted.every((line, i) => line === region.lines[i]);

  if (unchanged) {
    return { lines, changed: false };
  }

  return {
    lines: [
      ...lines.slice(0, region.start),
      ...sorted,
      ...lines.slice(region.end),
    ],
    changed: true,
  };
}

const SCRIPT_OPEN_RE = /<script\b[^>]*>/i;
const SCRIPT_CLOSE_RE = /<\/script>/i;

function sortEsmInVueSfc(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let changed = false;
  let i = 0;

  while (i < lines.length) {
    const open = SCRIPT_OPEN_RE.exec(lines[i]);
    if (!open) {
      i++;
      continue;
    }

    const scriptStart = i + 1;
    let scriptEnd = -1;
    for (let j = scriptStart; j < lines.length; j++) {
      if (SCRIPT_CLOSE_RE.test(lines[j])) {
        scriptEnd = j;
        break;
      }
    }
    if (scriptEnd === -1) {
      break;
    }

    const region = findImportRegion(lines, 'esm', scriptStart, scriptEnd);
    if (region) {
      const result = applySortedRegion(lines, region, 'esm');
      if (result.changed) {
        changed = true;
        // Replace in place; region indices still valid relative to current lines
        lines.splice(0, lines.length, ...result.lines);
      }
    }

    // Re-find closing tag after possible length change
    let next = scriptStart;
    for (let j = scriptStart; j < lines.length; j++) {
      if (SCRIPT_CLOSE_RE.test(lines[j])) {
        next = j + 1;
        break;
      }
    }
    i = next;
  }

  return changed ? lines.join('\n') : null;
}

export function kindForLanguageId(languageId: string): ImportKind | null {
  switch (languageId) {
    case 'php':
      return 'php';
    case 'javascript':
    case 'javascriptreact':
    case 'typescript':
    case 'typescriptreact':
    case 'vue':
      return 'esm';
    default:
      return null;
  }
}

export function sortImportsInText(
  text: string,
  languageId: string = 'php'
): string | null {
  const kind = kindForLanguageId(languageId);
  if (!kind) {
    return null;
  }

  if (languageId === 'vue') {
    return sortEsmInVueSfc(text);
  }

  const lines = text.split(/\r?\n/);
  const region = findImportRegion(lines, kind);
  if (!region) {
    return null;
  }

  const result = applySortedRegion(lines, region, kind);
  return result.changed ? result.lines.join('\n') : null;
}
