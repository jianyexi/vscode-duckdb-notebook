import * as vscode from 'vscode';
import { DuckDBConnectionManager } from './duckdb-connection';
import { renderResultToHtml, renderErrorToHtml } from './table-renderer';

const NOTEBOOK_TYPE = 'duckdb-notebook';

export class DuckDBController {
    private readonly controller: vscode.NotebookController;
    private executionOrder = 0;
    private readonly connections = new Map<string, DuckDBConnectionManager>();

    constructor() {
        this.controller = vscode.notebooks.createNotebookController(
            'duckdb-notebook-controller',
            NOTEBOOK_TYPE,
            'DuckDB'
        );

        this.controller.supportedLanguages = ['duckdb-sql', 'sql'];
        this.controller.supportsExecutionOrder = true;
        this.controller.description = 'Execute SQL queries with DuckDB';
        this.controller.executeHandler = this.executeCells.bind(this);
    }

    private getConnection(notebook: vscode.NotebookDocument): DuckDBConnectionManager {
        const key = notebook.uri.toString();
        if (!this.connections.has(key)) {
            this.connections.set(key, new DuckDBConnectionManager());
        }
        return this.connections.get(key)!;
    }

    private async executeCells(
        cells: vscode.NotebookCell[],
        notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): Promise<void> {
        for (const cell of cells) {
            await this.executeCell(cell, notebook);
        }
    }

    private async executeCell(
        cell: vscode.NotebookCell,
        notebook: vscode.NotebookDocument
    ): Promise<void> {
        const execution = this.controller.createNotebookCellExecution(cell);
        execution.executionOrder = ++this.executionOrder;
        execution.start(Date.now());

        const sql = cell.document.getText().trim();
        if (!sql) {
            execution.replaceOutput([]);
            execution.end(true, Date.now());
            return;
        }

        try {
            const conn = this.getConnection(notebook);
            const result = await conn.query(sql);

            if (result && result.columns.length > 0) {
                const html = renderResultToHtml(result);
                execution.replaceOutput([
                    new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.text(html, 'text/html'),
                        vscode.NotebookCellOutputItem.text(
                            this.formatPlainText(lastResult),
                            'text/plain'
                        ),
                    ])
                ]);
            } else {
                const msg = result
                    ? `Query OK (${result.elapsed}ms)`
                    : 'No results';
                execution.replaceOutput([
                    new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.text(msg, 'text/plain')
                    ])
                ]);
            }
            execution.end(true, Date.now());
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(
                        renderErrorToHtml(message), 'text/html'
                    ),
                    vscode.NotebookCellOutputItem.error(
                        err instanceof Error ? err : new Error(message)
                    ),
                ])
            ]);
            execution.end(false, Date.now());
        }
    }

    private formatPlainText(result: { columns: string[]; rows: unknown[][] }): string {
        const { columns, rows } = result;
        const widths = columns.map((c, i) => {
            let max = c.length;
            for (const row of rows.slice(0, 50)) {
                max = Math.max(max, String(row[i] ?? 'NULL').length);
            }
            return Math.min(max, 40);
        });

        let out = columns.map((c, i) => c.padEnd(widths[i])).join(' | ') + '\n';
        out += widths.map(w => '-'.repeat(w)).join('-+-') + '\n';
        for (const row of rows) {
            out += row.map((v, i) => String(v ?? 'NULL').padEnd(widths[i])).join(' | ') + '\n';
        }
        return out;
    }

    dispose(): void {
        this.controller.dispose();
        for (const conn of this.connections.values()) {
            conn.dispose();
        }
        this.connections.clear();
    }
}
