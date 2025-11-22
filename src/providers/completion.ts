import * as vscode from 'vscode';
import { m4fparserFromString } from '../m4fparser';

export function registerSimpleCompletionProvider(context: vscode.ExtensionContext) {
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
        }, '$')
    );
}

export function registerMacroCompletionProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('m4', {
        async provideCompletionItems(document, position) {
            const items: vscode.CompletionItem[] = [];
            // built-in snippets (lower priority)
            const bi = ['define', 'include', 'ifdef', 'ifndef', 'dnl', 'divert'];
            for (const b of bi) {
                const it = new vscode.CompletionItem(b, vscode.CompletionItemKind.Keyword);
                it.detail = 'm4 keyword';
                it.sortText = 'z_' + b;
                items.push(it);
            }

            // collect macros from workspace .m4f files (higher priority)
            try {
                const uris = await vscode.workspace.findFiles('**/*.m4f', '**/node_modules/**', 50);
                for (const u of uris) {
                    try {
                        const buf = await vscode.workspace.fs.readFile(u);
                        const list: Array<{ name: string; value: string }> = [];
                        m4fparserFromString(buf.toString(), (buildin: any, other: any) => {
                            for (const e of buildin) { list.push({ name: e.name, value: e.value || '' }); }
                            for (const e of other) { list.push({ name: e.name, value: e.value || '' }); }
                        }, () => { });
                        for (const entry of list) {
                            const name = entry.name;
                            const value = entry.value || '';
                            const paramMatches = value.match(/\$([1-9][0-9]*)/g) || [];
                            let maxParam = 0;
                            for (const pm of paramMatches) {
                                const num = Number(pm.replace('$', ''));
                                if (!isNaN(num)) { maxParam = Math.max(maxParam, num); }
                            }
                            const it = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
                            it.detail = `macro from ${u.fsPath}`;
                            it.sortText = '0_' + name;
                            if (maxParam > 0) {
                                const placeholders = Array.from({ length: maxParam }, (_, i) => '${' + (i + 1) + ':arg' + (i + 1) + '}').join(', ');
                                const snippetText = `${name}(${placeholders})`;
                                it.insertText = new vscode.SnippetString(snippetText);
                                it.documentation = `macro(${maxParam} args)`;
                            } else {
                                it.insertText = name;
                            }
                            items.push(it);
                        }
                    } catch (e) { }
                }
            } catch (e) { }

            return items;
        }
    }));
}
