import * as vscode from 'vscode';

export function registerM4fSemanticTokensProvider(context: vscode.ExtensionContext) {
    const zero = new vscode.Position(0, 0);
    const first = new vscode.Range(zero, zero);
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: 'm4f' }, {
        provideDocumentSymbols(document, token) {
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

export function registerM4DocumentSymbolProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: 'm4' }, {
        provideDocumentSymbols(document, token) {
            const symbols: vscode.DocumentSymbol[] = [];
            const text = document.getText();
            const lines = text.split(/\r?\n/);
            const defineRe = /define\s*\(\s*[`']?([A-Za-z0-9_\-\.]+)[`']?\s*,/i;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const m = defineRe.exec(line);
                if (m && m[1]) {
                    const name = m[1];
                    const start = new vscode.Position(i, line.indexOf(name));
                    const end = new vscode.Position(i, line.indexOf(name) + name.length);
                    const range = new vscode.Range(start, end);
                    const symbol = new vscode.DocumentSymbol(name, 'm4 macro', vscode.SymbolKind.Function, range, range);
                    symbols.push(symbol);
                }
            }
            return symbols;
        }
    }));
}
