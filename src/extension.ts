import * as vscode from 'vscode';
import { kindForLanguageId, sortImportsInText } from './sortImports';

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

    const document = editor.document;
    const text = document.getText();
    const sorted = sortImportsInText(text, languageId);

    if (sorted === null) {
      vscode.window.showInformationMessage(
        'Imports Sort: nothing to sort (no imports, or already sorted)'
      );
      return;
    }

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length)
    );

    return editor.edit((editBuilder) => {
      editBuilder.replace(fullRange, sorted);
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
