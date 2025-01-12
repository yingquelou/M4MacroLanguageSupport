import * as vscode from 'vscode';
var r = /^\w\s*(\d+)\s*,\s*(\d+)\s*/;

export function m4fparser(m4f: vscode.TextDocument) {
    var begin = new vscode.Range(m4f.positionAt(0), m4f.positionAt(0));
    var buildin = new vscode.DocumentSymbol("__buildin__", "", vscode.SymbolKind.Module, begin, begin);

    const m4flines = m4f.getText().split(/\r?\n/);
    m4flines.forEach((v, i, a) => {
        var m = v.match(r);
        if (m && m.length > 0) {
            var name = a[i + 1].substring(0, Number.parseInt(m[1]));
            var detail: string = a[i + 1].substring(name.length, name.length + Number.parseInt(m[2]));
            const vd = new vscode.DocumentSymbol(name, detail, vscode.SymbolKind.Variable, begin, begin);
            buildin.children.push(vd);
        }
    });
    return buildin;
}
export function m4parser(buildin: vscode.DocumentSymbol, m4: vscode.TextDocument, m4f: vscode.TextDocument) {
    const vds: vscode.DocumentSymbol[] = [];
    vds.push(buildin);
    var begin = new vscode.Range(m4.positionAt(0), m4.positionAt(0));
    var userdefined = new vscode.DocumentSymbol("__userdefined__", "", vscode.SymbolKind.Namespace, begin, begin);
    vds.push(userdefined);

    const m4flines = m4f.getText().split(/\r?\n/);
    const m4text = m4.getText();
    m4flines.forEach((v, i, a) => {
        var m = v.match(r);
        if (m && m.length > 0) {
            var name = a[i + 1].substring(0, Number.parseInt(m[1]));
            var start = m4text.indexOf(name);
            if (start !== -1) {
                if (buildin.children.some(v => {
                    return v.name === name;
                })) { } else {
                    var detail: string = a[i + 1].substring(name.length, name.length + Number.parseInt(m[2]));
                    var rg = new vscode.Range(m4.positionAt(start), m4.positionAt(start + name.length));
                    const vd = new vscode.DocumentSymbol(name, detail, vscode.SymbolKind.Variable, rg, rg);
                    userdefined.children.push(vd);
                }
            }
        }
    });
    return vds;
}