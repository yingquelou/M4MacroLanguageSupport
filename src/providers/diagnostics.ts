import * as vscode from 'vscode';

export function registerFormattingProvider(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('m4', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            const full = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
            const lines = document.getText().split(/\r?\n/);
            const out = lines.map(l => l.replace(/[ \t]+$/g, '')); // trim trailing whitespace
            let text = out.join('\n');
            if (!text.endsWith('\n')) { text += '\n'; }
            return [vscode.TextEdit.replace(full, text)];
        }
    }));
}

export function registerDiagnostics(context: vscode.ExtensionContext) {
    const collection = vscode.languages.createDiagnosticCollection('m4');
    context.subscriptions.push(collection);

    function validateDocument(document: vscode.TextDocument) {
        if (document.languageId !== 'm4') { return; }
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // unbalanced backticks (`)
        const backtickCount = (text.match(/`/g) || []).length;
        if (backtickCount % 2 === 1) {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1));
            diagnostics.push(new vscode.Diagnostic(range, 'Unmatched backtick (`) in document', vscode.DiagnosticSeverity.Warning));
        }

        // unbalanced single or double quotes
        const singleQuoteCount = (text.match(/'/g) || []).length;
        if (singleQuoteCount % 2 === 1) {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1));
            diagnostics.push(new vscode.Diagnostic(range, "Unmatched single quote (') in document", vscode.DiagnosticSeverity.Warning));
        }
        const doubleQuoteCount = (text.match(/\"/g) || []).length;
        if (doubleQuoteCount % 2 === 1) {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1));
            diagnostics.push(new vscode.Diagnostic(range, 'Unmatched double quote (") in document', vscode.DiagnosticSeverity.Warning));
        }

        // simple check: define(...) occurrences should have a closing ')'
        const defineRe = /define\s*\(/ig;
        let m: RegExpExecArray | null;
        while ((m = defineRe.exec(text)) !== null) {
            const startIdx = m.index + m[0].length - 1; // position of '('
            const closeIdx = text.indexOf(')', startIdx + 1);
            if (closeIdx === -1) {
                const pos = document.positionAt(startIdx);
                const range = new vscode.Range(pos, pos.translate(0, 1));
                diagnostics.push(new vscode.Diagnostic(range, 'Missing closing ")" for define(...)', vscode.DiagnosticSeverity.Warning));
            }
        }

        collection.set(document.uri, diagnostics);
    }

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(validateDocument));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => validateDocument(e.document)));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)));

    for (const doc of vscode.workspace.textDocuments) {
        try { validateDocument(doc); } catch (e) { }
    }
}
