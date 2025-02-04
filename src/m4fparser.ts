import { createReadStream } from 'fs';
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
var r2 = /\n?(\w)\s*(\d+)\s*,\s*(\d+)\s*/;
export function m4fparserFromPath(m4fpath: string, callback: any, cb: any) {
    createReadStream(m4fpath, { encoding: 'utf-8' }).on('data', (chunk) => {
        m4fparserFromString(chunk, cb, callback);
    });
}
export function m4fparserFromString(chunk: string | Buffer<ArrayBufferLike>, cb: any, callback: any) {
    type kv = { name: string; value: string; variablesReference: number; };
    var buildin: kv[] = [];
    var other: kv[] = [];
    var rest: string = chunk as string;
    var mats: RegExpMatchArray | null;
    while ((mats = rest.match(r2)) !== null) {
        if (mats.index !== undefined) {
            const nameStart = mats.index + mats[0].length;
            const nameEnd = nameStart + Number.parseInt(mats[2]);
            const defineStart = nameEnd;
            const defineEnd = defineStart + Number.parseInt(mats[3]);
            const name = rest.substring(nameStart, nameEnd);
            const define = rest.substring(defineStart, defineEnd);
            const variable = { name: name, value: define, variablesReference: 0 };
            if (mats[1] === 'F') {
                buildin.push(variable);
            } else {
                other.push(variable);
            }
            rest = rest.substring(defineEnd);
        }
    }
    cb(buildin, other);
    callback();
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