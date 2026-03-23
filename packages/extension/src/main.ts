import type { LanguageClientOptions, ServerOptions} from 'vscode-languageclient/node.js';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { registerDefaultCommands, registerLspEditCommands } from 'sprotty-vscode';
import { ERWebviewPanelManager } from './webview-panel-manager';
import { registerImportCommand } from './import/import-command';

let languageClient: LanguageClient;

// This function is called when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
    languageClient = startLanguageClient(context);

    const webviewPanelManager = new ERWebviewPanelManager({
        extensionUri: context.extensionUri,
        defaultDiagramType: 'er-diagram',
        languageClient,
        supportedFileExtensions: ['.er', '.erd'],
    });
    registerDefaultCommands(webviewPanelManager, context, { extensionPrefix: 'biger' });
    registerLspEditCommands(webviewPanelManager, context, { extensionPrefix: 'biger' });
    registerImportCommand(context, languageClient);
}

// This function is called when the extension is deactivated.
export async function deactivate(): Promise<void> {
    if (languageClient) {
        await languageClient.stop();
    }
}

function startLanguageClient(context: vscode.ExtensionContext): LanguageClient {
    const serverModule = context.asAbsolutePath(path.join('pack', 'language-server', 'src', 'main.cjs'));
    
    // debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // by setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };

    // if the extension is launched in debug mode then the debug server options are used
    // otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*.er');
    context.subscriptions.push(fileSystemWatcher);

    // options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'entity-relationship' }],
        synchronize: {
            // Notify the server about file changes to files contained in the workspace
            fileEvents: fileSystemWatcher
        }
    };

    // create the language client and start the client.
    const client = new LanguageClient(
        'entity-relationship',
        'Entity Relationship',
        serverOptions,
        clientOptions
    );

    // start the client. This will also launch the server
    client.start();
    return client;
}
