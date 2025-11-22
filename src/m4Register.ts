import * as vscode from 'vscode';
import { exec, execSync } from 'child_process';
import { m4fCustomReadonlyEditorProvider } from './m4fCustomReadonlyEditorProvider';
import { getPort, closeServer } from './m4DebugAdapter';

import { registerM4fSemanticTokensProvider, registerM4DocumentSymbolProvider } from './providers/symbols';
import { registerSimpleCompletionProvider, registerMacroCompletionProvider } from './providers/completion';
import { registerFormattingProvider, registerDiagnostics } from './providers/diagnostics';
import { registerCodeActions, registerReferencesAndRename } from './providers/codeactions';

function m4RegisterCommand(context: vscode.ExtensionContext) {
    // avoid duplicate registration which causes activation to fail
    vscode.commands.getCommands(true).then((cmds) => {
        if (cmds.includes('m4.exportDiverts')) {
            return;
        }
        context.subscriptions.push(vscode.commands.registerCommand('m4.exportDiverts', async () => {
            const s = vscode.debug.activeDebugSession;
            if (!s) { vscode.window.showWarningMessage('No active debug session'); return; }
            try {
                const divs = await s.customRequest('getDiverts');
                if (!divs || !Array.isArray(divs) || divs.length === 0) { vscode.window.showInformationMessage('No divert streams available'); return; }
                const pick = await vscode.window.showQuickPick(divs.map((d: any) => `divert ${d.stream} (${d.content.length} chars)`), { placeHolder: 'Choose divert to export' });
                if (!pick) { return; }
                const idx = parseInt(pick.split(' ')[1], 10);
                const sel = divs.find((d: any) => d.stream === idx);
                if (!sel) { vscode.window.showErrorMessage('Selected divert not found'); return; }
                const action = await vscode.window.showQuickPick(['Open', 'Save'], { placeHolder: 'Open in editor or Save to file?' });
                if (!action) { return; }
                if (action === 'Open') {
                    const doc = await vscode.workspace.openTextDocument({ content: sel.content, language: 'plaintext' });
                    await vscode.window.showTextDocument(doc, { preview: true });
                } else {
                    const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`divert-${idx}.txt`) });
                    if (!uri) { return; }
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(sel.content, 'utf8'));
                    vscode.window.showInformationMessage(`Exported divert ${idx} to ${uri.fsPath}`);
                }
            } catch (err: any) {
                vscode.window.showErrorMessage('Failed to export diverts: ' + (err?.message || String(err)));
            }
        }));
    }, () => {
        // fallback: try to register and ignore errors
        try {
            context.subscriptions.push(vscode.commands.registerCommand('m4.exportDiverts', async () => {
                const s = vscode.debug.activeDebugSession;
                if (!s) { vscode.window.showWarningMessage('No active debug session'); return; }
                try {
                    const divs = await s.customRequest('getDiverts');
                    if (!divs || !Array.isArray(divs) || divs.length === 0) { vscode.window.showInformationMessage('No divert streams available'); return; }
                    const pick = await vscode.window.showQuickPick(divs.map((d: any) => `divert ${d.stream} (${d.content.length} chars)`), { placeHolder: 'Choose divert to export' });
                    if (!pick) { return; }
                    const idx = parseInt(pick.split(' ')[1], 10);
                    const sel = divs.find((d: any) => d.stream === idx);
                    if (!sel) { vscode.window.showErrorMessage('Selected divert not found'); return; }
                    const action = await vscode.window.showQuickPick(['Open', 'Save'], { placeHolder: 'Open in editor or Save to file?' });
                    if (!action) { return; }
                    if (action === 'Open') {
                        const doc = await vscode.workspace.openTextDocument({ content: sel.content, language: 'plaintext' });
                        await vscode.window.showTextDocument(doc, { preview: true });
                    } else {
                        const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`divert-${idx}.txt`) });
                        if (!uri) { return; }
                        await vscode.workspace.fs.writeFile(uri, Buffer.from(sel.content, 'utf8'));
                        vscode.window.showInformationMessage(`Exported divert ${idx} to ${uri.fsPath}`);
                    }
                } catch (err: any) {
                    vscode.window.showErrorMessage('Failed to export diverts: ' + (err?.message || String(err)));
                }
            }));
        } catch (e) { }
    });
}

function m4RegisterDebugAdapter(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory('m4', {
            async createDebugAdapterDescriptor(session, executable) {
                let p = getPort();
                const start = Date.now();
                while ((!p || p === 0) && (Date.now() - start) < 500) {
                    await new Promise((r) => setTimeout(r, 50));
                    p = getPort();
                }
                if (p && p > 0) {
                    return new vscode.DebugAdapterServer(p);
                }
                return new vscode.DebugAdapterInlineImplementation(new (require('./M4DebugSession').default)());
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

function m4RegisterDefinitionAndHoverProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'm4' }, {
        provideDefinition(document, position) {
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_\-\.]+/);
            if (!wordRange) { return null; }
            const name = document.getText(wordRange);
            const text = document.getText();
            const defineRe = new RegExp("define\\s*\\(\\s*[`']?" + name.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&') + "[`']?\\s*,", 'i');
            const m = defineRe.exec(text);
            if (m && typeof m.index === 'number') {
                const idx = m.index;
                const pos = document.positionAt(idx);
                return new vscode.Location(document.uri, pos);
            }
            return null;
        }
    }));

    context.subscriptions.push(vscode.languages.registerHoverProvider({ language: 'm4' }, {
        provideHover(document, position) {
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_\-\.]+/);
            if (!wordRange) { return undefined; }
            const name = document.getText(wordRange);
            const text = document.getText();
            const defineRe = new RegExp("define\\s*\\(\\s*[`']?" + name.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&') + "[`']?\\s*,([\s\S]*?)\\)\\s*;?", 'i');
            const m = defineRe.exec(text);
            if (m) {
                const body = (m[1] || '').trim();
                const preview = body.length > 200 ? body.substring(0, 200) + '...': body;
                return new vscode.Hover({ language: 'plaintext', value: `m4 define(${name}): ${preview}` });
            }
            return undefined;
        }
    }));
}

function m4RegisterProvider(context: vscode.ExtensionContext) {
    // register modular providers
    registerM4fSemanticTokensProvider(context);
    registerM4DocumentSymbolProvider(context);
    registerSimpleCompletionProvider(context);
    registerMacroCompletionProvider(context);
    registerFormattingProvider(context);
    registerDiagnostics(context);
    registerCodeActions(context);
    registerReferencesAndRename(context);

    // providers remaining in this file
    m4RegisterCustomEditorProvider(context);
    m4RegisterDebugAdapter(context);
    m4RegisterDefinitionAndHoverProvider(context);
    m4RegisterCommand(context);
}

export { m4RegisterProvider, m4RegisterCommand };

export function closeServerIfAny() {
    try { closeServer(); } catch (e) { }
}
