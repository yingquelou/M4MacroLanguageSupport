import * as vscode from 'vscode';
import { exec } from 'child_process';
function m4RegisterCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('test.helloWorld', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World from test!');
    }));
}

function m4RegisterCompletionItemProvider(context: vscode.ExtensionContext) {
    // 创建多个补全项
    const completionItems: vscode.CompletionItem[] = [];
    const item1 = new vscode.CompletionItem('$', vscode.CompletionItemKind.Snippet);
    item1.detail = 'Special arguments to macros';
    item1.documentation = `Reference macro parameters in a macro body`;
    var sn = new vscode.SnippetString;
    sn.appendChoice(['@', '#', '*', 'naturalNumber']);
    item1.insertText = sn;
    completionItems.push(item1);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('m4', {
            provideCompletionItems(document, position) {
                return completionItems;
            }
        }, '$') // 触发补全的字符
    );
}
function m4RegisterDocumentSymbolProvider(context: vscode.ExtensionContext) {
    const m4config = vscode.workspace.getConfiguration("m4");
    if (!m4config.has("path")) {
        vscode.window.showWarningMessage("m4 path undefine in settings.json")
        return;
    }
    var path = m4config.get<string>("path");
    if (path) {
        const reg = /\${env:(.*)}/
        const match = path.match(reg)
        if (match) {
            path = path.replace(match[0], process.env[match[1]] as string).replace("\\", "/")
            // vscode.workspace.openTextDocument({ content: path })
        }
        exec([path, "--version"].join(" "), (error, out, err) => {
            if (error) { vscode.window.showWarningMessage(error.message); return; }
            if (err) { vscode.window.showWarningMessage(err); return; }
            // if (out) { vscode.window.showInformationMessage(out) }
            exec([path].join(" "))
            context.subscriptions.push(
                vscode.languages.registerDocumentSymbolProvider('m4', {
                    async provideDocumentSymbols(document, token) {
                        const dss: vscode.DocumentSymbol[] = [];


                        return dss;
                    },
                }));
        })
    }
}
export { m4RegisterDocumentSymbolProvider, m4RegisterCommand, m4RegisterCompletionItemProvider };