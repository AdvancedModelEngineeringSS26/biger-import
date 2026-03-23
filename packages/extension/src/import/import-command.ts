import { IMPORT_SQL_REQUEST, type ImportSqlParams, type ImportSqlResult } from '@biger/common';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

const ER_LANGUAGE_ID = 'entity-relationship';

export function registerImportCommand(context: vscode.ExtensionContext, languageClient: LanguageClient): void {
    const commandDisposable = vscode.commands.registerCommand('biger.import', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== ER_LANGUAGE_ID) {
            void vscode.window.showErrorMessage('Open an .er file before running Import.');
            return;
        }

        const selectedSqlFile = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Import SQL',
            filters: {
                'SQL Files': ['sql']
            }
        });

        if (!selectedSqlFile || selectedSqlFile.length === 0) {
            return;
        }

        const sqlFileUri = selectedSqlFile[0];
        const sqlFileContents = await vscode.workspace.fs.readFile(sqlFileUri);
        const sqlContent = new TextDecoder('utf-8').decode(sqlFileContents);

        const importParams: ImportSqlParams = {
            erDocumentUri: editor.document.uri.toString(),
            sqlDocumentUri: sqlFileUri.toString(),
            sqlContent
        };

        const importResult = await languageClient.sendRequest<ImportSqlResult>(IMPORT_SQL_REQUEST, importParams);
        await overwriteDocument(editor.document, importResult.erContent);
    });

    context.subscriptions.push(commandDisposable);
}

async function overwriteDocument(document: vscode.TextDocument, content: string): Promise<void> {
    const fullTextRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(document.uri, fullTextRange, content);
    await vscode.workspace.applyEdit(workspaceEdit);
}
