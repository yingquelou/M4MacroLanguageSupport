// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { m4RegisterCommand, m4RegisterCompletionItemProvider, m4RegisterDocumentSymbolProvider } from './m4init';
import * as fs from 'fs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "test" is now active!');
	const m4out = vscode.window.createOutputChannel('m4', 'm4');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json

	m4RegisterCommand(context);
	m4RegisterDocumentSymbolProvider(context);
	m4RegisterCompletionItemProvider(context);
}

// This method is called when your extension is deactivated
export function deactivate() { }
