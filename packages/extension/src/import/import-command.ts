import { IMPORT_SQL_REQUEST, type ImportSqlParams, type ImportSqlResult, type SqlDialect } from '@biger/common';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

const ER_LANGUAGE_ID = 'entity-relationship';
const SQL_LANGUAGE_ID = 'sql';

const DIALECT_OPTIONS: { label: string; dialect: SqlDialect }[] = [
    { label: 'MySQL',                        dialect: 'MySQL' },
    { label: 'PostgreSQL',                   dialect: 'PostgreSQL' },
    { label: 'MariaDB',                      dialect: 'MariaDB' },
    { label: 'SQLite',                       dialect: 'Sqlite' },
    { label: 'Hive',                         dialect: 'Hive' },
    { label: 'IBM DB2',                      dialect: 'DB2' },
    { label: 'Amazon Redshift',              dialect: 'Redshift' },
    { label: 'Snowflake',                    dialect: 'Snowflake' },
    { label: 'Apache Flink SQL',             dialect: 'FlinkSQL' },
    { label: 'T-SQL / SQL Server (no FK)',   dialect: 'TransactSQL' },
    { label: 'BigQuery (no FK)',             dialect: 'BigQuery' },
];

export function registerImportCommand(context: vscode.ExtensionContext, languageClient: LanguageClient): void {
    const commandDisposable = vscode.commands.registerCommand('biger.import', async () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            void vscode.window.showErrorMessage('Open a .sql or .er file to use ER: Import.');
            return;
        }

        const langId = editor.document.languageId;

        if (langId === SQL_LANGUAGE_ID) {
            await importFromSqlFile(editor, languageClient);
        } else if (langId === ER_LANGUAGE_ID) {
            await importIntoErFile(editor, languageClient);
        } else {
            void vscode.window.showErrorMessage('Open a .sql or .er file to use ER: Import.');
        }
    });

    context.subscriptions.push(commandDisposable);
}

// SQL-first path: active file is .sql → create a new .er file beside it.
async function importFromSqlFile(editor: vscode.TextEditor, languageClient: LanguageClient): Promise<void> {
    const selectedDialect = await pickDialect();
    if (!selectedDialect) {
        return;
    }

    const sqlContent = editor.document.getText();
    const erUri = await resolveErUri(editor.document.uri.fsPath);

    const importParams: ImportSqlParams = {
        erDocumentUri: erUri.toString(),
        sqlDocumentUri: editor.document.uri.toString(),
        sqlContent,
        dialect: selectedDialect.dialect,
    };

    const importResult = await languageClient.sendRequest<ImportSqlResult>(IMPORT_SQL_REQUEST, importParams);
    if (importResult.error) {
        void vscode.window.showErrorMessage(`SQL import failed: ${importResult.error}`);
        return;
    }

    await vscode.workspace.fs.writeFile(erUri, new TextEncoder().encode(importResult.erContent));
    const doc = await vscode.workspace.openTextDocument(erUri);
    await vscode.window.showTextDocument(doc);
}

// ER-first path: active file is .er → pick a .sql file and overwrite the current document.
async function importIntoErFile(editor: vscode.TextEditor, languageClient: LanguageClient): Promise<void> {
    const selectedDialect = await pickDialect();
    if (!selectedDialect) {
        return;
    }

    const selectedSqlFile = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Import SQL',
        filters: { 'SQL Files': ['sql'] },
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
        sqlContent,
        dialect: selectedDialect.dialect,
    };

    const importResult = await languageClient.sendRequest<ImportSqlResult>(IMPORT_SQL_REQUEST, importParams);
    if (importResult.error) {
        void vscode.window.showErrorMessage(`SQL import failed: ${importResult.error}`);
        return;
    }
    await overwriteDocument(editor.document, importResult.erContent);
}

async function pickDialect(): Promise<{ label: string; dialect: SqlDialect } | undefined> {
    return vscode.window.showQuickPick(DIALECT_OPTIONS, {
        title: 'Select SQL Dialect',
        placeHolder: 'Choose the dialect of the SQL file you want to import',
    });
}

// Returns a URI for a .er file derived from the SQL file path.
// If <stem>.er already exists, appends a number: <stem>1.er, <stem>2.er, …
async function resolveErUri(sqlFsPath: string): Promise<vscode.Uri> {
    const dir = path.dirname(sqlFsPath);
    const stem = path.basename(sqlFsPath, path.extname(sqlFsPath));

    const base = vscode.Uri.file(path.join(dir, `${stem}.er`));
    if (!await fileExists(base)) {
        return base;
    }

    for (let i = 1; ; i++) {
        const candidate = vscode.Uri.file(path.join(dir, `${stem}${i}.er`));
        if (!await fileExists(candidate)) {
            return candidate;
        }
    }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
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
