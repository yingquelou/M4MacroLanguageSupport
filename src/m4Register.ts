import * as vscode from 'vscode';
import { exec, execSync } from 'child_process';
import { m4fCustomReadonlyEditorProvider } from './m4fCustomReadonlyEditorProvider';
import { port } from './m4DebugAdapter';
function m4RegisterCommand(context: vscode.ExtensionContext) {

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json

    // context.subscriptions.push(vscode.commands.registerCommand('m4.debugger.start', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        // vscode.debug.activeDebugSession?.customRequest('start');
        // vscode.window.showInformationMessage('Hello World from test!');
    // }));
}

function m4fRegisterDocumentSemanticTokensProvider(context: vscode.ExtensionContext) {
    const zero = new vscode.Position(0, 0);
    const first = new vscode.Range(zero, zero);
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: 'm4f' }, {
        provideDocumentSymbols(document, token) {
            //设置换行符
            vscode.commands.executeCommand('setContext', 'm4f:enabled', true);
            const buildin = new vscode.DocumentSymbol("buildin", "", vscode.SymbolKind.Module, first, first);
            const userdefine = new vscode.DocumentSymbol("userdefine", "", vscode.SymbolKind.Module, first, first);
            var symbols: vscode.DocumentSymbol[] = [buildin, userdefine];
            const text = document.getText();
            const lines = text.split(/\r?\n/);
            var f = /^[A-Za-z]\s*(\d+)\s*,\s*(\d+)\s*/;
            lines.forEach((line, i) => {
                let match = f.exec(line);
                if (match) {
                    const start = new vscode.Position(i + 1, 0);
                    const nameRange = new vscode.Range(start, document.positionAt((document.offsetAt(start) + Number.parseInt(match[1]))));
                    const symbol = new vscode.DocumentSymbol((document.getText(nameRange)), line[0], vscode.SymbolKind.Function, nameRange, nameRange);
                    if (line[0] === 'F') {
                        symbol.detail = '';
                        buildin.children.push(symbol);
                    } else if (line[0] === 'T') {
                        const detaillen = Number.parseInt(match[2]);
                        symbol.detail = document.getText(new vscode.Range(nameRange.end, document.positionAt(document.offsetAt(nameRange.end) + detaillen)));
                        // if (document.eol === vscode.EndOfLine.LF) {
                        //     symbol.detail = symbol.detail.replace(/\n/g, '\r\n').substring(0, detaillen);
                        // }
                        // 判断是windows还是linux

                        userdefine.children.push(symbol);
                    }
                }
            });
            return symbols;
        },
    }));
    const semanticTokenTypes = ['macro'];
    var legend = new vscode.SemanticTokensLegend(semanticTokenTypes);

    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: 'm4f' }, {
        provideDocumentSemanticTokens(document) {
            const builder = new vscode.SemanticTokensBuilder(legend);
            const text = document.getText();
            const lines = text.split(/\r?\n/);
            var f = /^[A-Za-z]\s*(\d+)\s*,\s*(\d+)\s*/;
            lines.forEach((line, i) => {
                let match = f.exec(line);
                if (match) {
                    const start = new vscode.Position(i + 1, 0);
                    const end = document.offsetAt(start) + Number.parseInt(match[1]);
                    const nameRange = new vscode.Range(start, document.positionAt(end));
                    builder.push(nameRange, 'macro');
                }
            });
            return builder.build();
        },
    }, legend));
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
    var path: string | undefined;
    exec([path, "--version"].join(" "), (error, _, err) => {
        if (error || err) { path = undefined; return; }
        path = "m4";
    });
    const m4config = vscode.workspace.getConfiguration("m4");
    var cpath = m4config.get<string>("path");
    if (cpath) {
        const reg = /\${env:(.*)}/;
        const match = cpath.match(reg);
        if (match) {
            cpath = cpath.replace(match[0], process.env[match[1]] as string).replace("\\", "/");
        }
        execSync([cpath, "--version"].join(" "));
        // exec([cpath, "--version"].join(" "), (error, _, err) => {
        //     if (error || err) { return; }
        // })
        path = cpath;
    }
    if (path) {
        vscode.window.showInformationMessage(path);
        exec([path, "--version"].join(" "), (error, out, err) => {
            if (error) { vscode.window.showWarningMessage(error.message); return; }
            if (err) { vscode.window.showWarningMessage(err); return; }
            context.subscriptions.push(
                vscode.languages.registerDocumentSymbolProvider('m4', {
                    async provideDocumentSymbols(document, token) {
                        const dss: vscode.DocumentSymbol[] = [];


                        return dss;
                    },
                }));
        });
    }
}

function m4RegisterDebugAdapter(context: vscode.ExtensionContext) {

    // var server: Net.Server | undefined;
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory('m4', {
            createDebugAdapterDescriptor(session, executable) {
                // if (!server) {
                //     server = Net.createServer((socket) => {
                //         const session = new M4DebugSession();
                //         session.setRunAsServer(false)
                //         session.start(socket as NodeJS.ReadableStream, socket);
                //     }).listen(8081)
                // }
                // const port = (server.address() as Net.AddressInfo).port;
                return new vscode.DebugAdapterServer(port);
                // return new vscode.DebugAdapterInlineImplementation(new M4DebugSession()); 
            }
        })

    );

    const configs: vscode.DebugConfiguration[] = [];
    context.extension.packageJSON.contributes.debuggers.filter((v: any) => {
        return v.type === 'm4';
    }).forEach((curDebugger: any) => {
        curDebugger.configurationSnippets.forEach((snippet: any) => {
            configs.push(snippet.body);
        });
    });
    vscode.debug.registerDebugConfigurationProvider('m4', {
        provideDebugConfigurations(folder, token) {
            if (token?.isCancellationRequested) { }
            else { return configs; }
        },
    }, vscode.DebugConfigurationProviderTriggerKind.Initial);
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('m4', {
        provideDebugConfigurations(folder, token) {
            if (token?.isCancellationRequested) { }
            else { return configs; }
        },
    }, vscode.DebugConfigurationProviderTriggerKind.Dynamic));
}
function m4RegisterCustomEditorProvider(context: vscode.ExtensionContext) {
    const m4feditorProvider = new m4fCustomReadonlyEditorProvider();
    context.subscriptions.push(vscode.window.registerCustomEditorProvider('m4f', m4feditorProvider));
}
function test(context: vscode.ExtensionContext) {
}
function m4RegisterProvider(context: vscode.ExtensionContext) {
    m4RegisterDocumentSymbolProvider(context);
    m4RegisterCompletionItemProvider(context);
    m4fRegisterDocumentSemanticTokensProvider(context);
    m4RegisterCustomEditorProvider(context);
    m4RegisterDebugAdapter(context);

    test(context);

}
export { m4RegisterProvider, m4RegisterCommand };
