import * as vscode from 'vscode';

export function registerCodeActions(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider('m4', {
        provideCodeActions(document, range, contextActions, token) {
            const results: vscode.CodeAction[] = [];
            const diags = contextActions.diagnostics || [];
            for (const d of diags) {
                if (d.message.indexOf('Missing closing ")" for define(...)') !== -1) {
                    const title = 'Insert missing ")" for define(...)';
                    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
                    action.diagnostics = [d];
                    action.isPreferred = true;
                    action.edit = new vscode.WorkspaceEdit();
                    const insertPos = d.range.end;
                    action.edit.insert(document.uri, insertPos, ')');
                    results.push(action);
                }
                if (d.message.indexOf('Unmatched backtick') !== -1) {
                    const title = 'Insert closing backtick (`)';
                    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
                    action.diagnostics = [d];
                    action.edit = new vscode.WorkspaceEdit();
                    const end = document.positionAt(document.getText().length);
                    action.edit.insert(document.uri, end, '`');
                    results.push(action);
                }
                if (d.message.indexOf("Unmatched single quote") !== -1) {
                    const title = "Insert closing single quote (')";
                    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
                    action.diagnostics = [d];
                    action.edit = new vscode.WorkspaceEdit();
                    const end = document.positionAt(document.getText().length);
                    action.edit.insert(document.uri, end, "'");
                    results.push(action);
                }
                if (d.message.indexOf('Unmatched double quote') !== -1) {
                    const title = 'Insert closing double quote (")';
                    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
                    action.diagnostics = [d];
                    action.edit = new vscode.WorkspaceEdit();
                    const end = document.positionAt(document.getText().length);
                    action.edit.insert(document.uri, end, '"');
                    results.push(action);
                }
            }
            return results;
        }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));
}

export function registerReferencesAndRename(context: vscode.ExtensionContext) {
    // Reference provider
    context.subscriptions.push(vscode.languages.registerReferenceProvider('m4', {
        async provideReferences(document, position, contextRef, token) {
            const wr = document.getWordRangeAtPosition(position, /[A-Za-z0-9_\-\.]+/);
            if (!wr) { return []; }
            const name = document.getText(wr);
            const results: vscode.Location[] = [];
            try {
                const uris = await vscode.workspace.findFiles('**/*.{m4,m4f}', '**/node_modules/**', 200);
                const re = new RegExp("\\b" + name.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\b", 'g');
                for (const u of uris) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(u);
                        const text = doc.getText();
                        let m: RegExpExecArray | null;
                        while ((m = re.exec(text)) !== null) {
                            const pos = doc.positionAt(m.index);
                            const wr2 = doc.getWordRangeAtPosition(pos, /[A-Za-z0-9_\-\.]+/);
                            const range = wr2 || new vscode.Range(pos, pos);
                            results.push(new vscode.Location(u, range));
                        }
                    } catch (e) { }
                }
            } catch (e) { }
            return results;
        }
    }));

    // Rename provider
    context.subscriptions.push(vscode.languages.registerRenameProvider('m4', {
        async provideRenameEdits(document, position, newName, token) {
            const wr = document.getWordRangeAtPosition(position, /[A-Za-z0-9_\-\.]+/);
            if (!wr) { return null; }
            const oldName = document.getText(wr);
            if (!newName || newName.length === 0) { return null; }
            const edit = new vscode.WorkspaceEdit();
            try {
                const uris = await vscode.workspace.findFiles('**/*.{m4,m4f}', '**/node_modules/**', 500);
                const re = new RegExp("\\b" + oldName.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\b", 'g');
                for (const u of uris) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(u);
                        const text = doc.getText();
                        let m: RegExpExecArray | null;
                        while ((m = re.exec(text)) !== null) {
                            const start = doc.positionAt(m.index);
                            const end = doc.positionAt(m.index + oldName.length);
                            edit.replace(u, new vscode.Range(start, end), newName);
                        }
                    } catch (e) { }
                }
            } catch (e) { }
            return edit;
        }
    }));
}
