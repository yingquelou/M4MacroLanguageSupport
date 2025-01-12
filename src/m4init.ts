import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { m4fparser, m4parser } from './m4fparser';
function m4RegisterCommand(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('test.helloWorld', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World from test!');
    }));
}

var m4ter: vscode.Terminal | undefined;
var configfile: string = "";
var defaultWindowsProfile: string = "terminal.integrated.defaultProfile.windows";
function m4GetTerminal(context: vscode.ExtensionContext) {
    if (m4ter !== undefined && m4ter.exitStatus === undefined) { return m4ter; }
    if (context.storageUri) {
        configfile = path.join(context.globalStorageUri.fsPath, 'm4.conf.json');
        if (fs.existsSync(configfile)) {
            var def = JSON.parse(fs.readFileSync(configfile).toString())[defaultWindowsProfile];

            vscode.workspace.getConfiguration().update(defaultWindowsProfile, def, vscode.ConfigurationTarget.Workspace).then(
                _ => {
                    m4ter = m4ter ? m4ter : vscode.window.createTerminal();
                }
            );
        } else {
            const opt: string[] = [];
            var ter = vscode.workspace.getConfiguration("terminal.integrated.profiles.windows");
            for (var i in JSON.parse(JSON.stringify(ter))) {
                opt.push(i);
            }
            vscode.window.showQuickPick(opt, { title: "选择提供m4的终端环境" }).then((v) => {
                if (v) {
                    // var config: any = ter.get(v)
                    fs.mkdirSync(context.globalStorageUri.fsPath);
                    fs.writeFileSync(configfile, JSON.stringify({ [defaultWindowsProfile]: v }));
                    vscode.workspace.getConfiguration().update(defaultWindowsProfile, v, vscode.ConfigurationTarget.Workspace
                    ).then(
                        (v) => {
                            m4ter = m4ter ? m4ter : vscode.window.createTerminal();
                        }
                    );
                }
            });
        }
    }
    return m4ter;
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
    var ter = m4GetTerminal(context);
    vscode.workspace.fs.writeFile;
    vscode.workspace.fs.createDirectory(context.globalStorageUri)
    var buildin = vscode.Uri.joinPath(context.globalStorageUri, fs.mkdtempSync('m4')+".m4");

    var bds: vscode.DocumentSymbol | undefined;
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider('m4', {
            async provideDocumentSymbols(document, token) {
                const dss = [];
                if (ter === undefined) {
                    ter = m4GetTerminal(context);
                }
                if (!bds) {
                    await vscode.workspace.fs.writeFile(buildin, new Uint8Array());
                    var bp = buildin.path.split(/:/).join('').replace(/\s/,"\\ ");
                    ter?.sendText([
                        "m4", `"${bp}"`, "-F", `${bp}f`
                    ].join(" "), true);
                   var bf= vscode.Uri.file(buildin.path.concat('f'))
                    var bdoc = await vscode.workspace.openTextDocument(bf);
                    bds = m4fparser(bdoc);
                }
    
                var f = document.uri.path.split(/:/).join('').replace(/\s/,"\\ ");
                ter?.sendText([
                    "m4", f, "-F", `${f}f`
                ].join(" "), true);
                var doc = await vscode.workspace.openTextDocument(vscode.Uri.file(document.uri.path.concat('f')));
                dss.push(...m4parser(bds, document, doc));
                return dss;
            },
        }));
}
export { m4RegisterDocumentSymbolProvider, m4RegisterCommand, m4GetTerminal, m4RegisterCompletionItemProvider };