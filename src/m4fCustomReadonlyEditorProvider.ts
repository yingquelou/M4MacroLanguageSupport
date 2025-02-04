import * as vscode from 'vscode';
import { m4fparserFromString } from './m4fparser';

export class m4fCustomReadonlyEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private _uri?: vscode.Uri;
    openCustomDocument(uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken)
        : vscode.CustomDocument | Thenable<vscode.CustomDocument> {
        this._uri = uri;
        return {
            uri,
            dispose() { },
        };
    }
    resolveCustomEditor(document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken)
        : Thenable<void> | void {
        this.getViewContext(webviewPanel);
        webviewPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'save':
                        // 处理保存逻辑
                        break;
                }
            }
        );
    }
    private _header: string = `<html lang="en">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
</head>
<body>`;
    private _trailer: string = `</body>
</html>`;

    private getViewContext(webviewPanel: vscode.WebviewPanel) {
        if (this._uri) {
            vscode.workspace.fs.readFile(this._uri).then((v) => {
                m4fparserFromString(v.toString(), (buildin: any, other: any) => {
                    const opt = (entry: any) => {
                        return `<tr><th><pre>${entry.name}</pre></th><td><pre>${entry.value}</pre></td></tr>`;
                    };
                    const buildins = m4fCustomReadonlyEditorProvider.mapS('buildin', buildin, opt);
                    const others = m4fCustomReadonlyEditorProvider.mapS('other', other, opt);
                    webviewPanel.webview.html = this._header + buildins + others + this._trailer;
                    // console.log(webviewPanel.webview.html);
                }, () => { });
            });
        }
    }
    private static mapS(caption: string, arr: any[], cb: (_: string) => string) {
        return `<table>
<caption>${caption}</caption>
<tbody>
${arr.map((v) => { return cb(v); }).join()}
</tbody>
    </table>`
    }
}
