import * as vscode from 'vscode';
import { createFileUri, createWebviewTitle, SprottyDiagramIdentifier, WebviewContainer } from "sprotty-vscode";
import { LspWebviewEndpoint, LspWebviewPanelManager } from "sprotty-vscode/lib/lsp";
import { addLspLabelEditActionHandler, addWorkspaceEditActionHandler } from 'sprotty-vscode/lib/lsp/editing';

export class ERWebviewPanelManager extends LspWebviewPanelManager {

    /**
     * Keep VS Code's canonical URI serialization (e.g. `file:///c%3A/...` on Windows)
     * so Langium's URI matching can consistently map text-document updates to diagram servers.
     */
    protected override async createDiagramIdentifier(uri: vscode.Uri, diagramType?: string): Promise<SprottyDiagramIdentifier | undefined> {
        const identifier = await super.createDiagramIdentifier(uri, diagramType);
        if (identifier) {
            identifier.uri = uri.toString();
        }
        return identifier;
    }

    // Override to customize URIs for local resources, scripts, and styles
    protected override createWebview(identifier: SprottyDiagramIdentifier): vscode.WebviewPanel {
        const extensionPath = this.options.extensionUri.fsPath;
        return this.createWebviewPanel(identifier, {
            localResourceRoots: [createFileUri(extensionPath, 'pack', 'diagram')],
            scriptUri: createFileUri(extensionPath, 'pack', 'diagram', 'main.js'),
            cssUri: createFileUri(extensionPath, 'pack', 'diagram', 'main.css')
        });
    }

    // Override to add action handlers for workspace edits and label edits
    protected override createEndpoint(identifier: SprottyDiagramIdentifier): LspWebviewEndpoint {
        const endpoint = super.createEndpoint(identifier);
        addWorkspaceEditActionHandler(endpoint);
        addLspLabelEditActionHandler(endpoint);
        return endpoint;
    }

    private createWebviewPanel(identifier: SprottyDiagramIdentifier,
        options: { localResourceRoots: vscode.Uri[], scriptUri: vscode.Uri, cssUri?: vscode.Uri; }): vscode.WebviewPanel {
        const title = createWebviewTitle(identifier);
        const diagramPanel = vscode.window.createWebviewPanel(
            identifier.diagramType || 'diagram',
            title,
            vscode.ViewColumn.Beside,
            {
                localResourceRoots: options.localResourceRoots,
                enableScripts: true,
                retainContextWhenHidden: true
            });
        diagramPanel.webview.html = this.createWebviewHtml(identifier, diagramPanel, {
            scriptUri: options.scriptUri,
            cssUri: options.cssUri,
            title,
        });
        return diagramPanel;
    }

    private createWebviewHtml(identifier: SprottyDiagramIdentifier, container: WebviewContainer,
        options: { scriptUri: vscode.Uri, cssUri?: vscode.Uri, title?: string; }): string {
        const transformUri = (uri: vscode.Uri) => container.webview.asWebviewUri(uri).toString();
        // connect-src is required to allow to load WASM file(needed e.g. for libavoid router)
        // 'wasm-unsafe-eval' is required to allow execution of the loaded WebAssembly code
        return `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, height=device-height">
            ${options.title ? `<title>${options.title}</title>` : ''}
            ${options.cssUri ? `<link rel="stylesheet" type="text/css" href="${transformUri(options.cssUri)}" />` : ''}
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${container.webview.cspSource} 'wasm-unsafe-eval'; style-src 'unsafe-inline' ${container.webview.cspSource}; connect-src ${container.webview.cspSource};">
        </head>
        <body>
            <div id="${identifier.clientId}_container" style="height: 100%;"></div>
            <script src="${transformUri(options.scriptUri)}"></script>
        </body>
    </html>`;
    }
}
