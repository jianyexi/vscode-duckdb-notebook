import { QueryResult } from './duckdb-connection';

export function renderResultToHtml(result: QueryResult): string {
    const { columns, rows, rowCount, totalRows, truncated, elapsed, types } = result;

    if (columns.length === 0) {
        return `<div style="padding:8px;font-family:var(--vscode-font-family);color:var(--vscode-foreground);">
            Query executed successfully. ${elapsed}ms</div>`;
    }

    const escapeHtml = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const formatValue = (val: unknown): string => {
        if (val === null || val === undefined) {
            return '<span style="color:var(--vscode-descriptionForeground);font-style:italic;">NULL</span>';
        }
        const str = String(val);
        if (str.length > 200) {
            return escapeHtml(str.slice(0, 200)) + '…';
        }
        return escapeHtml(str);
    };

    let html = `<style>
        .duckdb-result { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); color: var(--vscode-foreground); }
        .duckdb-result table { border-collapse: collapse; width: 100%; }
        .duckdb-result th { background: var(--vscode-editor-selectionBackground); padding: 4px 8px; text-align: left; border: 1px solid var(--vscode-panel-border); font-weight: 600; position: sticky; top: 0; }
        .duckdb-result td { padding: 3px 8px; text-align: left; border: 1px solid var(--vscode-panel-border); }
        .duckdb-result tr:nth-child(even) { background: var(--vscode-list-hoverBackground); }
        .duckdb-result .meta { padding: 4px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    </style>
    <div class="duckdb-result">
    <table><thead><tr>`;

    for (let i = 0; i < columns.length; i++) {
        html += `<th title="${escapeHtml(types[i])}">${escapeHtml(columns[i])}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const row of rows) {
        html += '<tr>';
        for (const val of row) {
            html += `<td>${formatValue(val)}</td>`;
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    html += `<div class="meta">${totalRows} row${totalRows !== 1 ? 's' : ''}`;
    if (truncated) {
        html += ` (showing ${rowCount})`;
    }
    html += ` · ${elapsed}ms</div></div>`;

    return html;
}

export function renderErrorToHtml(error: string): string {
    const escapeHtml = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `<div style="font-family:var(--vscode-editor-font-family);color:var(--vscode-errorForeground);padding:8px;white-space:pre-wrap;">${escapeHtml(error)}</div>`;
}
