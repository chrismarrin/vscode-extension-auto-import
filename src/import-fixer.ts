import * as vscode from 'vscode'
import * as path from 'path';

import { ImportObject } from './import-db';

export class ImportFixer {

    private spacesBetweenBraces;
    private doubleQuotes;

    constructor() {
        let config = vscode.workspace.getConfiguration('autoimport');

        this.spacesBetweenBraces = config.get<boolean>('spaceBetweenBraces');
        this.doubleQuotes = config.get<boolean>('doubleQuotes');
    }

    public fix(document: vscode.TextDocument, range: vscode.Range,
        context: vscode.CodeActionContext, token: vscode.CancellationToken, imports: Array<ImportObject>): void {

        let edit = this.getTextEdit(document, imports);

        vscode.workspace.applyEdit(edit);
    }

    public getTextEdit(document: vscode.TextDocument, imports: Array<ImportObject>) {

        let edit: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();
        let importObj: vscode.Uri | any = imports[0].file;
        let importName: string = imports[0].name;

        let relativePath = this.normaliseRelativePath(importObj, this.getRelativePath(document, importObj));

        if (this.alreadyResolved(document, relativePath, importName)) {
            return edit;
        }

        if (this.shouldMergeImport(document, relativePath)) {
            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0),
                this.mergeImports(document, edit, importName, importObj, relativePath));
        } else if (/^\/(\/\*) *@flow/.test(document.getText())) {
            edit.insert(document.uri, new vscode.Position(1, 0),
                this.createImportStatement(imports[0].name, relativePath, true));
        } else {
            edit.insert(document.uri, new vscode.Position(0, 0),
                this.createImportStatement(imports[0].name, relativePath, true));
        }

        return edit;
    }

    private alreadyResolved(document: vscode.TextDocument, relativePath, importName) {

        let singleQuoteExp = '(?:import\ \{)(?:.*)(?:\}\ from\ \')(?:' + relativePath + ')(?:\'\;)'
        let doubleQuoteExp = '(?:import\ \{)(?:.*)(?:\}\ from\ \")(?:' + relativePath + ')(?:\"\;)'
        let exp = new RegExp( this.doubleQuotes ? doubleQuoteExp : singleQuoteExp );

        let currentDoc = document.getText();

        let foundImport = currentDoc.match(exp)

        if (foundImport && foundImport.length > 0 && foundImport[0].indexOf(importName) > -1) {
            return true;
        }

        return false;
    }

    private shouldMergeImport(document: vscode.TextDocument, relativePath): boolean {
        let currentDoc = document.getText();

        let isCommentLine = (text: string): boolean => {
            let firstTwoLetters = text.trim().substr(0, 2);
            return firstTwoLetters === '//' || firstTwoLetters === '/*';
        }

        return currentDoc.indexOf(relativePath) !== -1 && !isCommentLine(currentDoc);
    }

    private mergeImports(document: vscode.TextDocument, edit: vscode.WorkspaceEdit, name, file, relativePath: string) {

        let singleQuoteExp = '(?:import\ \{)(?:.*)(?:\}\ from\ \')(?:' + relativePath + ')(?:\'\;)'
        let doubleQuoteExp = '(?:import\ \{)(?:.*)(?:\}\ from\ \")(?:' + relativePath + ')(?:\"\;)'
        let exp = new RegExp( this.doubleQuotes ? doubleQuoteExp : singleQuoteExp );

        let currentDoc = document.getText();

        let foundImport = currentDoc.match(exp)

        if (foundImport) {
            let workingString = foundImport[0];

            workingString = workingString
                .replace(/{|}|from|import|'|"| |;/gi, '').replace(relativePath, '');

            let importArray = workingString.split(',');

            importArray.push(name)

            let newImport = this.createImportStatement(importArray.join(', '), relativePath);

            currentDoc = currentDoc.replace(exp, newImport);
        }

        return currentDoc;
    }

    private createImportStatement(imp: string, path: string, endline: boolean = false): string {
        let formattedPath = path.replace(/\"/g, '')
            .replace(/\'/g, '');
        if ((this.doubleQuotes) && (this.spacesBetweenBraces)) {
            return `import { ${imp} } from "${formattedPath}";${endline ? '\r\n' : ''}`;
        } else if (this.doubleQuotes) {
            return `import {${imp}} from "${formattedPath}";${endline ? '\r\n' : ''}`;
        } else if (this.spacesBetweenBraces) {
            return `import { ${imp} } from '${formattedPath}';${endline ? '\r\n' : ''}`;
        } else {
            return `import {${imp}} from '${formattedPath}';${endline ? '\r\n' : ''}`;
        }
    }

    private getRelativePath(document, importObj: vscode.Uri | any): string {
        return importObj.discovered ? importObj.fsPath :
            path.relative(path.dirname(document.fileName), importObj.fsPath);
    }

    private normaliseRelativePath(importObj, relativePath: string): string {

        let removeFileExtenion = (rp) => {
            if (rp) {
                rp = rp.substring(0, rp.lastIndexOf('.'))
            }
            return rp;
        }

        let makeRelativePath = (rp) => {

            let preAppend = './';

            if (!rp.startsWith(preAppend)) {
                rp = preAppend + rp;
            }

            if (/^win/.test(process.platform)) {
                rp = rp.replace(/\\/g, '/');
            }

            return rp;
        }

        if (importObj.discovered === undefined) {
            relativePath = makeRelativePath(relativePath);
            relativePath = removeFileExtenion(relativePath);
        }

        return relativePath;
    }
}