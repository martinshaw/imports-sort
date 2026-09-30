import * as vscode from 'vscode';
import { kindForLanguageId, sortImportsInText } from './sortImports';

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

  // Untitled / no extension: allow if any configured extension maps to this language
  return configured.some(
    (e) => EXTENSION_TO_LANGUAGE[e] === document.languageId
  );
}

function shouldSortOnSave(): boolean {
  return getConfig().get<boolean>('sortOnSave', false);
}

function sortDocumentText(
  document: vscode.TextDocument
): vscode.TextEdit[] | null {
  const languageId = document.languageId;
  if (!kindForLanguageId(languageId) || !isFileEnabled(document)) {
    return null;
  }

  const text = document.getText();
  const sorted = sortImportsInText(text, languageId);
  if (sorted === null) {
    return null;
  }

  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(text.length)
  );
  return [vscode.TextEdit.replace(fullRange, sorted)];
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('importsSort.sort', () => {
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

    const edits = sortDocumentText(editor.document);
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
  });

  const onWillSave = vscode.workspace.onWillSaveTextDocument((event) => {
    if (!shouldSortOnSave()) {
      return;
    }

    const edits = sortDocumentText(event.document);
    if (!edits) {
      return;
    }

    event.waitUntil(Promise.resolve(edits));
  });

  context.subscriptions.push(disposable, onWillSave);
}

export function deactivate() {}
