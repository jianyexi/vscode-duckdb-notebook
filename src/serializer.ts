import * as vscode from 'vscode';

interface RawNotebook {
    cells: RawCell[];
    metadata?: Record<string, unknown>;
}

interface RawCell {
    kind: 'code' | 'markdown';
    language: string;
    value: string;
    outputs?: RawOutput[];
}

interface RawOutput {
    mime: string;
    data: string;
}

export class DuckDBNotebookSerializer implements vscode.NotebookSerializer {
    async deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): Promise<vscode.NotebookData> {
        const text = new TextDecoder().decode(content);
        let raw: RawNotebook;

        try {
            raw = text.trim() ? JSON.parse(text) : { cells: [] };
        } catch {
            raw = {
                cells: [{
                    kind: 'code',
                    language: 'duckdb-sql',
                    value: text // Treat entire file as one SQL cell
                }]
            };
        }

        if (!raw.cells || raw.cells.length === 0) {
            raw.cells = [{
                kind: 'code',
                language: 'duckdb-sql',
                value: '-- Write your SQL here\nSELECT 1 AS hello;'
            }];
        }

        const cells = raw.cells.map(cell => {
            const kind = cell.kind === 'markdown'
                ? vscode.NotebookCellKind.Markup
                : vscode.NotebookCellKind.Code;
            const language = cell.kind === 'markdown' ? 'markdown' : (cell.language || 'duckdb-sql');
            return new vscode.NotebookCellData(kind, cell.value, language);
        });

        return new vscode.NotebookData(cells);
    }

    async serializeNotebook(
        data: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Promise<Uint8Array> {
        const raw: RawNotebook = {
            cells: data.cells.map(cell => ({
                kind: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'code',
                language: cell.languageId,
                value: cell.value,
            })),
        };
        return new TextEncoder().encode(JSON.stringify(raw, null, 2));
    }
}
