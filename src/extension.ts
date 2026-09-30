import { execFile } from 'child_process';
import * as vscode from 'vscode';
import {
  findImportRegion,
  kindForLanguageId,
  sortImportsInText,
  type QuoteStyle,
  type SemicolonStyle,
  type SortOptions,
} from './sortImports';

/** File extensions → VS Code language IDs used for sorting. */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.php': 'php',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescriptreact',
  '.vue': 'vue',
};

export const ALL_EXTENSIONS = Object.keys(EXTENSION_TO_LANGUAGE);

const SUPPORTED_LANGUAGE_SELECTOR: vscode.DocumentSelector = [
  { language: 'php' },
  { language: 'javascript' },
  { language: 'javascriptreact' },
  { language: 'typescript' },
  { language: 'typescriptreact' },
  { language: 'vue' },
];

function getConfig() {
  return vscode.workspace.getConfiguration('importsSort');
}

function normalizeExtension(ext: string): string {
  const trimmed = ext.trim().toLowerCase();
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

function getConfiguredExtensions(): string[] {
  return getConfig()
    .get<string[]>('fileExtensions', ALL_EXTENSIONS)
    .map(normalizeExtension);
}

function getDocumentExtension(document: vscode.TextDocument): string | null {
  const name = document.uri.fsPath || document.fileName;
  const match = /\.[^.\\/]+$/i.exec(name);
  return match ? match[0].toLowerCase() : null;
}

function isFileEnabled(document: vscode.TextDocument): boolean {
  const configured = getConfiguredExtensions();
  const ext = getDocumentExtension(document);

  if (ext) {
    return configured.includes(ext);
  }

  return configured.some(
    (e) => EXTENSION_TO_LANGUAGE[e] === document.languageId
  );
}

function shouldSortOnSave(): boolean {
  return getConfig().get<boolean>('sortOnSave', false);
}

function getSortOptions(): SortOptions {
  const config = getConfig();
  return {
    separateTypeImports: config.get<boolean>('separateTypeImports', true),
    separateCssImports: config.get<boolean>('separateCssImports', true),
    quoteStyle: config.get<QuoteStyle>('quoteStyle', 'detect'),
    semicolons: config.get<SemicolonStyle>('semicolons', 'detect'),
    collapseMultilineImports: config.get<boolean>(
      'collapseMultilineImports',
      false
    ),
    collapseMultilineMaxLength: config.get<number>(
      'collapseMultilineMaxLength',
      100
    ),
  };
}

function isGitIgnored(fsPath: string): Promise<boolean> {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
  if (!folder || folder.uri.scheme !== 'file') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', folder.uri.fsPath, 'check-ignore', '-q', '--', fsPath],
      (error) => {
        // exit 0 → ignored (error is null)
        // exit 1 → not ignored
        // other → treat as not ignored
        resolve(error == null);
      }
    );
  });
}

async function shouldSkipDocument(
  document: vscode.TextDocument
): Promise<boolean> {
  if (document.uri.scheme !== 'file') {
    return false;
  }
  return isGitIgnored(document.uri.fsPath);
}

function buildSortEdits(
  document: vscode.TextDocument
): vscode.TextEdit[] | null {
  const languageId = document.languageId;
  if (!kindForLanguageId(languageId) || !isFileEnabled(document)) {
    return null;
  }

  const text = document.getText();
  const sorted = sortImportsInText(text, languageId, getSortOptions());
  if (sorted === null) {
    return null;
  }

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(text.length)
  );
  return [vscode.TextEdit.replace(fullRange, sorted)];
}

function rangeIntersectsImportRegion(
  document: vscode.TextDocument,
  range: vscode.Range
): boolean {
  const kind = kindForLanguageId(document.languageId);
  if (!kind) {
    return false;
  }

  const lines = document.getText().split(/\r?\n/);

  if (document.languageId === 'vue') {
    const scriptOpen = /<script\b[^>]*>/i;
    const scriptClose = /<\/script>/i;
    let i = 0;
    while (i < lines.length) {
      if (!scriptOpen.test(lines[i])) {
        i++;
        continue;
      }
      const scriptStart = i + 1;
      let scriptEnd = -1;
      for (let j = scriptStart; j < lines.length; j++) {
        if (scriptClose.test(lines[j])) {
          scriptEnd = j;
          break;
        }
      }
      if (scriptEnd === -1) {
        break;
      }
      const region = findImportRegion(lines, 'esm', scriptStart, scriptEnd);
      if (region) {
        const regionRange = new vscode.Range(region.start, 0, region.end, 0);
        if (range.intersection(regionRange)) {
          return true;
        }
      }
      i = scriptEnd + 1;
    }
    return false;
  }

  const region = findImportRegion(lines, kind);
  if (!region) {
    return false;
  }
  const regionRange = new vscode.Range(region.start, 0, region.end, 0);
  return range.intersection(regionRange) !== undefined;
}

class SortImportsCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.Source.append('sortImports'),
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection
  ): vscode.CodeAction[] | undefined {
    if (!kindForLanguageId(document.languageId) || !isFileEnabled(document)) {
      return;
    }
    if (!rangeIntersectsImportRegion(document, range)) {
      return;
    }

    const action = new vscode.CodeAction(
      'Sort Imports',
      vscode.CodeActionKind.Source.append('sortImports')
    );
    action.command = {
      command: 'importsSort.sort',
      title: 'Sort Imports',
    };
    return [action];
  }
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'importsSort.sort',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Imports Sort: no active editor');
        return;
      }

      const languageId = editor.document.languageId;
      if (!kindForLanguageId(languageId)) {
        vscode.window.showInformationMessage(
          'Imports Sort: supports PHP, Vue, JavaScript, JSX, TypeScript, and TSX'
        );
        return;
      }

      if (!isFileEnabled(editor.document)) {
        const ext = getDocumentExtension(editor.document) ?? languageId;
        vscode.window.showInformationMessage(
          `Imports Sort: "${ext}" is disabled in importsSort.fileExtensions`
        );
        return;
      }

      if (await shouldSkipDocument(editor.document)) {
        vscode.window.showInformationMessage(
          'Imports Sort: skipped (file is gitignored)'
        );
        return;
      }

      const edits = buildSortEdits(editor.document);
      if (!edits) {
        vscode.window.showInformationMessage(
          'Imports Sort: nothing to sort (no imports, or already sorted)'
        );
        return;
      }

      return editor.edit((editBuilder) => {
        for (const edit of edits) {
          editBuilder.replace(edit.range, edit.newText);
        }
      });
    }
  );

  const onWillSave = vscode.workspace.onWillSaveTextDocument((event) => {
    if (!shouldSortOnSave()) {
      return;
    }

    event.waitUntil(
      (async () => {
        if (await shouldSkipDocument(event.document)) {
          return [] as vscode.TextEdit[];
        }
        return buildSortEdits(event.document) ?? [];
      })()
    );
  });

  const codeActions = vscode.languages.registerCodeActionsProvider(
    SUPPORTED_LANGUAGE_SELECTOR,
    new SortImportsCodeActionProvider(),
    {
      providedCodeActionKinds:
        SortImportsCodeActionProvider.providedCodeActionKinds,
    }
  );

  context.subscriptions.push(disposable, onWillSave, codeActions);
}

export function deactivate() {}
