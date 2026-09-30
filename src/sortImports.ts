/**
 * Sort import/`use` statements: shortest line first; equal length uses
 * path length, then namespace/module prefix length.
 * Blank-line sections are sorted independently and kept separate.
 * In JS/TS/Vue, type and CSS imports can be moved to dedicated sections.
 */

export type ImportKind = 'php' | 'esm';

export type QuoteStyle = 'single' | 'double' | 'detect';
export type SemicolonStyle = 'always' | 'never' | 'detect';

export interface SortOptions {
  /** Move `import type` into a section after other ESM imports (before CSS). */
  separateTypeImports?: boolean;
  /** Move CSS imports into a section at the end. */
  separateCssImports?: boolean;
  /** Normalize module-specifier quotes. */
  quoteStyle?: QuoteStyle;
  /** Normalize trailing semicolons on import/`use` statements. */
  semicolons?: SemicolonStyle;
  /**
   * Collapse multi-line named imports to one line, or expand single-line
   * named imports that exceed `collapseMultilineMaxLength`.
   */
  collapseMultilineImports?: boolean;
  /** Line length threshold used when `collapseMultilineImports` is enabled. */
  collapseMultilineMaxLength?: number;
}

export type ResolvedSortOptions = Required<SortOptions>;

export const DEFAULT_SORT_OPTIONS: ResolvedSortOptions = {
  separateTypeImports: true,
  separateCssImports: true,
  quoteStyle: 'detect',
  semicolons: 'detect',
  collapseMultilineImports: false,
  collapseMultilineMaxLength: 100,
};

export function resolveSortOptions(
  options: SortOptions = {}
): ResolvedSortOptions {
  return { ...DEFAULT_SORT_OPTIONS, ...options };
}

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

/** True when braces in an ESM import text are balanced and the clause is complete. */
export function isCompleteEsmImport(text: string): boolean {
  let depth = 0;
  let quote: '"' | "'" | '`' | null = null;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    }
  }

  if (depth !== 0) {
    return false;
  }

  const t = text.trim();
  if (/\bfrom\s+['"][^'"]+['"]\s*;?\s*$/.test(t)) {
    return true;
  }
  if (/^import\s+['"][^'"]+['"]\s*;?\s*$/.test(t)) {
    return true;
  }
  return false;
}

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

/** `import type ...` (not inline `{ type X }`). */
export function isTypeImport(statement: string): boolean {
  return /^\s*import\s+type\b/.test(statement);
}

/**
 * Normalize named-import braces to `{ a, b }` style: one space after `{`,
 * after each comma, and before `}`. Only touches the clause before `from`.
 */
export function formatEsmImportBraces(line: string): string {
  const fromIdx = line.search(/\bfrom\s+['"]/);
  const head = fromIdx === -1 ? line : line.slice(0, fromIdx);
  const tail = fromIdx === -1 ? '' : line.slice(fromIdx);

  const formatted = head.replace(/\{([^}]*)\}/gs, (_match, inner: string) => {
    const parts = inner
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) {
      return '{ }';
    }
    return `{ ${parts.join(', ')} }`;
  });

  return formatted + tail;
}

/** Collapse an ESM import to a single line and normalize braces. */
export function toSingleLineImport(statement: string): string {
  const collapsed = statement
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ');
  return formatEsmImportBraces(collapsed);
}

/** Expand a single-line named import onto multiple lines. */
export function toMultiLineImport(statement: string): string {
  const one = toSingleLineImport(statement);
  const match = /^(.*?)\{([^}]*)\}(.*)$/s.exec(one);
  if (!match) {
    return one;
  }
  const before = match[1].trimEnd();
  const parts = match[2]
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const after = match[3].trim();
  if (parts.length === 0) {
    return `${before} { }\n${after}`.replace(/\n+/g, '\n');
  }
  const body = parts.map((p) => `  ${p},`).join('\n');
  return `${before} {\n${body}\n} ${after}`.replace(/\} ;/, '};');
}

function detectQuoteStyle(statements: string[]): '"' | "'" {
  let single = 0;
  let double = 0;
  for (const s of statements) {
    const m = /(?:\bfrom\s+|import\s+)(['"])/m.exec(s);
    if (!m) {
      continue;
    }
    if (m[1] === "'") {
      single++;
    } else {
      double++;
    }
  }
  return double > single ? '"' : "'";
}

function detectSemicolonStyle(statements: string[]): boolean {
  let withSemi = 0;
  let withoutSemi = 0;
  for (const s of statements) {
    const t = s.trim();
    if (!t) {
      continue;
    }
    if (t.endsWith(';')) {
      withSemi++;
    } else {
      withoutSemi++;
    }
  }
  return withSemi >= withoutSemi;
}

export function applyQuoteStyle(
  statement: string,
  style: '"' | "'"
): string {
  return statement.replace(
    /\b(from\s+)(['"])([^'"]+)(['"])/g,
    (_m, from: string, _q1: string, spec: string) => `${from}${style}${spec}${style}`
  ).replace(
    /^(import\s+)(['"])([^'"]+)(['"])/m,
    (_m, imp: string, _q1: string, spec: string) => `${imp}${style}${spec}${style}`
  );
}

export function applySemicolon(statement: string, useSemicolon: boolean): string {
  const lines = statement.split('\n');
  const lastIdx = lines.length - 1;
  const indent = /^\s*/.exec(lines[lastIdx])?.[0] ?? '';
  let last = lines[lastIdx].trim();
  if (useSemicolon) {
    if (!last.endsWith(';')) {
      last = `${last};`;
    }
  } else if (last.endsWith(';')) {
    last = last.slice(0, -1).trimEnd();
  }
  lines[lastIdx] = indent + last;
  return lines.join('\n');
}

function applyCollapsePolicy(
  statement: string,
  options: ResolvedSortOptions
): string {
  const formatted = formatEsmImportBraces(statement);
  if (!options.collapseMultilineImports) {
    // Keep structure; still normalize braces on each brace group
    if (!statement.includes('\n')) {
      return formatted;
    }
    // Multi-line: normalize brace contents but keep line breaks by collapsing
    // then re-expand only when policy is on. When off, lightly tidy braces.
    return statement.replace(/\{([^}]*)\}/gs, (_match, inner: string) => {
      const parts = inner
        .split(',')
        .map((part: string) => part.trim())
        .filter((part: string) => part.length > 0);
      if (parts.length <= 1 && !inner.includes('\n')) {
        return parts.length === 0 ? '{ }' : `{ ${parts[0]} }`;
      }
      if (!inner.includes('\n')) {
        return `{ ${parts.join(', ')} }`;
      }
      const body = parts.map((p) => `  ${p},`).join('\n');
      return `{\n${body}\n}`;
    });
  }

  const oneLine = toSingleLineImport(statement);
  if (oneLine.length <= options.collapseMultilineMaxLength) {
    return oneLine;
  }
  if (/\{[^}]+\}/.test(oneLine)) {
    return toMultiLineImport(oneLine);
  }
  return oneLine;
}

function formatEsmStatement(
  statement: string,
  quote: '"' | "'",
  useSemicolon: boolean,
  options: ResolvedSortOptions
): string {
  let s = applyCollapsePolicy(statement, options);
  s = applyQuoteStyle(s, quote);
  s = applySemicolon(s, useSemicolon);
  return s;
}

function formatPhpStatement(statement: string, useSemicolon: boolean): string {
  return applySemicolon(statement.trimEnd(), useSemicolon);
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

function compareKey(statement: string): string {
  return statement.includes('\n') ? toSingleLineImport(statement) : statement;
}

export function compareImportLines(
  a: string,
  b: string,
  kind: ImportKind = 'php'
): number {
  const keyA = kind === 'esm' ? compareKey(a) : a;
  const keyB = kind === 'esm' ? compareKey(b) : b;

  const lenA = keyA.trimEnd().length;
  const lenB = keyB.trimEnd().length;
  if (lenA !== lenB) {
    return lenA - lenB;
  }

  const pathA = pathTokensetLength(keyA, kind);
  const pathB = pathTokensetLength(keyB, kind);
  if (pathA !== pathB) {
    return pathA - pathB;
  }

  const nsA = namespacePrefixLength(keyA, kind);
  const nsB = namespacePrefixLength(keyB, kind);
  if (nsA !== nsB) {
    return nsA - nsB;
  }

  return keyA.trim().localeCompare(keyB.trim());
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

function statementsToLines(statements: string[]): string[] {
  const lines: string[] = [];
  for (const statement of statements) {
    lines.push(...statement.split('\n'));
  }
  return lines;
}

function joinStatementSections(sections: string[][]): string[] {
  const result: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (i > 0) {
      result.push('');
    }
    result.push(...statementsToLines(sections[i]));
  }
  return result;
}

/** Parse ESM region lines into statements, preserving blank section breaks. */
export function parseEsmRegionStatements(lines: string[]): {
  sections: string[][];
} {
  const sections: string[][] = [];
  let current: string[] = [];
  let i = 0;

  const pushCurrent = () => {
    if (current.length > 0) {
      sections.push(current);
      current = [];
    }
  };

  while (i < lines.length) {
    if (isBlankLine(lines[i])) {
      pushCurrent();
      while (i < lines.length && isBlankLine(lines[i])) {
        i++;
      }
      continue;
    }

    if (!isEsmImportStatement(lines[i])) {
      break;
    }

    let text = lines[i];
    i++;
    while (i < lines.length && !isCompleteEsmImport(text)) {
      text += `\n${lines[i]}`;
      i++;
    }
    current.push(text);
  }

  pushCurrent();
  return { sections };
}

function sortPhpRegion(lines: string[], options: ResolvedSortOptions): string[] {
  const statements = lines.filter((l) => !isBlankLine(l));
  const useSemicolon =
    options.semicolons === 'always'
      ? true
      : options.semicolons === 'never'
        ? false
        : detectSemicolonStyle(statements);

  const sections = splitIntoSections(lines).map((section) =>
    sortImportSection(
      section.map((line) => formatPhpStatement(line, useSemicolon)),
      'php'
    )
  );
  return joinSections(sections);
}

function sortEsmRegion(lines: string[], options: ResolvedSortOptions): string[] {
  const { sections: rawSections } = parseEsmRegionStatements(lines);
  const allStatements = rawSections.flat();

  const quote: '"' | "'" =
    options.quoteStyle === 'single'
      ? "'"
      : options.quoteStyle === 'double'
        ? '"'
        : detectQuoteStyle(allStatements);

  const useSemicolon =
    options.semicolons === 'always'
      ? true
      : options.semicolons === 'never'
        ? false
        : detectSemicolonStyle(allStatements);

  const typeImports: string[] = [];
  const cssImports: string[] = [];
  const keptSections: string[][] = [];

  for (const section of rawSections) {
    const kept: string[] = [];
    for (const statement of section) {
      const formatted = formatEsmStatement(
        statement,
        quote,
        useSemicolon,
        options
      );
      if (options.separateCssImports && isCssImport(formatted)) {
        cssImports.push(formatted);
      } else if (options.separateTypeImports && isTypeImport(formatted)) {
        typeImports.push(formatted);
      } else {
        kept.push(formatted);
      }
    }
    if (kept.length > 0) {
      keptSections.push(sortImportSection(kept, 'esm'));
    }
  }

  const result = joinStatementSections(keptSections);

  if (typeImports.length > 0) {
    if (result.length > 0) {
      result.push('');
    }
    result.push(...statementsToLines(sortImportSection(typeImports, 'esm')));
  }

  if (cssImports.length > 0) {
    if (result.length > 0) {
      result.push('');
    }
    result.push(...statementsToLines(sortImportSection(cssImports, 'esm')));
  }

  return result;
}

/**
 * Sort import lines. For ESM, applies formatting options and optional
 * type/CSS section separation.
 */
export function sortImportRegion(
  lines: string[],
  kind: ImportKind = 'php',
  options: SortOptions = {}
): string[] {
  const resolved = resolveSortOptions(options);
  if (kind === 'php') {
    return sortPhpRegion(lines, resolved);
  }
  return sortEsmRegion(lines, resolved);
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
 * For ESM, multi-line imports are consumed as a whole.
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
  let i = start;
  while (i < toIndex) {
    const line = documentLines[i];
    if (isBlankLine(line)) {
      i++;
      continue;
    }
    if (!isImportStatement(line, kind)) {
      break;
    }

    if (kind === 'php') {
      end = i + 1;
      i++;
      continue;
    }

    let text = line;
    let j = i + 1;
    while (j < toIndex && !isCompleteEsmImport(text)) {
      text += `\n${documentLines[j]}`;
      j++;
    }
    end = j;
    i = j;
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
  kind: ImportKind,
  options: SortOptions
): { lines: string[]; changed: boolean } {
  const sorted = sortImportRegion(region.lines, kind, options);
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

function sortEsmInVueSfc(
  text: string,
  options: SortOptions
): string | null {
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
      const result = applySortedRegion(lines, region, 'esm', options);
      if (result.changed) {
        changed = true;
        lines.splice(0, lines.length, ...result.lines);
      }
    }

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
  languageId: string = 'php',
  options: SortOptions = {}
): string | null {
  const kind = kindForLanguageId(languageId);
  if (!kind) {
    return null;
  }

  if (languageId === 'vue') {
    return sortEsmInVueSfc(text, options);
  }

  const lines = text.split(/\r?\n/);
  const region = findImportRegion(lines, kind);
  if (!region) {
    return null;
  }

  const result = applySortedRegion(lines, region, kind, options);
  return result.changed ? result.lines.join('\n') : null;
}
