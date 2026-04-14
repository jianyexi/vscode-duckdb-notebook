import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export interface QueryResult {
    columns: string[];
    types: string[];
    rows: unknown[][];
    rowCount: number;
    totalRows: number;
    truncated: boolean;
    elapsed: number;
    statement: string;
}

/**
 * Connection manager that supports two modes:
 * 1. Native mode (@duckdb/node-api) — fast, in-process
 * 2. Binary mode (custom duckdb.exe) — supports extensions like sstream
 */
export class DuckDBConnectionManager {
    private instance: DuckDBInstance | null = null;
    private connection: DuckDBConnection | null = null;
    private binaryPath: string | null = null;

    private getConfig() {
        const config = vscode.workspace.getConfiguration('duckdb-notebook');
        return {
            dbPath: config.get<string>('databasePath', ':memory:'),
            maxRows: config.get<number>('maxRows', 1000),
            binaryPath: config.get<string>('binaryPath', ''),
        };
    }

    private useBinaryMode(): boolean {
        const { binaryPath } = this.getConfig();
        return !!binaryPath;
    }

    // ─── Native mode (@duckdb/node-api) ──────────────────────────────────

    private async ensureNativeConnection(): Promise<DuckDBConnection> {
        if (!this.connection) {
            const { dbPath } = this.getConfig();
            this.instance = await DuckDBInstance.create(dbPath);
            this.connection = await this.instance.connect();
        }
        return this.connection;
    }

    private async queryNative(sql: string): Promise<QueryResult> {
        const { maxRows } = this.getConfig();
        const conn = await this.ensureNativeConnection();
        const start = Date.now();

        const reader = await conn.runAndReadAll(sql);
        const elapsed = Date.now() - start;

        const columnCount = reader.columnCount;
        const columns: string[] = reader.columnNames();
        const types: string[] = [];
        for (let i = 0; i < columnCount; i++) {
            types.push(reader.columnType(i).toString());
        }

        const allRows = reader.getRows() as unknown[][];
        const totalRows = allRows.length;
        const truncated = totalRows > maxRows;
        const rows = allRows.slice(0, maxRows);

        return {
            columns, types, rows,
            rowCount: rows.length, totalRows, truncated, elapsed,
            statement: sql.slice(0, 100),
        };
    }

    // ─── Binary mode (persistent duckdb.exe with extensions) ─────────────

    private proc: cp.ChildProcess | null = null;

    private ensureBinaryProcess(): cp.ChildProcess {
        if (this.proc && !this.proc.killed) {
            return this.proc;
        }
        const { binaryPath, dbPath } = this.getConfig();
        const args = dbPath !== ':memory:' ? [dbPath] : [];
        this.proc = cp.spawn(binaryPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.proc.on('exit', () => { this.proc = null; });
        return this.proc;
    }

    private async queryBinary(sql: string): Promise<QueryResult> {
        const { maxRows } = this.getConfig();
        const start = Date.now();
        const END_MARKER = '___DUCKDB_NB_END___';

        const proc = this.ensureBinaryProcess();
        if (!proc.stdin || !proc.stdout || !proc.stderr) {
            throw new Error('DuckDB process streams not available');
        }

        // Send SQL, then a sentinel SELECT so we know when output is done
        const fullSql = `.mode json\n${sql}\nSELECT '${END_MARKER}' AS __end;\n`;

        const result = await new Promise<{ stdout: string; error: string }>((resolve) => {
            let stdout = '';
            let stderr = '';
            let settled = false;

            const finish = () => {
                if (settled) { return; }
                settled = true;
                proc.stdout!.removeListener('data', onOut);
                proc.stderr!.removeListener('data', onErr);
                // Strip the end-marker SELECT output from stdout
                const markerJson = `[{"__end":"${END_MARKER}"}]`;
                const mjIdx = stdout.indexOf(markerJson);
                if (mjIdx >= 0) {
                    stdout = stdout.substring(0, mjIdx);
                } else {
                    const idx = stdout.indexOf(END_MARKER);
                    if (idx >= 0) {
                        stdout = stdout.substring(0, idx);
                    }
                }
                // Remove any trailing partial JSON from the marker query
                stdout = stdout.replace(/\[\{"__end":"?\s*$/, '').trim();
                resolve({ stdout: stdout.trim(), error: stderr.trim() });
            };

            const onOut = (data: Buffer) => {
                stdout += data.toString();
                if (stdout.includes(END_MARKER)) { finish(); }
            };
            const onErr = (data: Buffer) => { stderr += data.toString(); };

            proc.stdout!.on('data', onOut);
            proc.stderr!.on('data', onErr);
            setTimeout(() => { if (!settled) { finish(); } }, 120000);

            proc.stdin!.write(fullSql);
        });

        const elapsed = Date.now() - start;
        if (result.error && !result.stdout) {
            throw new Error(result.error);
        }
        return this.parseJsonOutput(result.stdout, maxRows, elapsed, sql);
    }

    private parseJsonOutput(output: string, maxRows: number, elapsed: number, sql: string): QueryResult {
        const empty: QueryResult = { columns: [], types: [], rows: [], rowCount: 0, totalRows: 0, truncated: false, elapsed, statement: sql.slice(0, 100) };
        if (!output) { return empty; }

        // Try whole output as single JSON array (common single-SELECT case)
        try {
            const parsed = JSON.parse(output) as Record<string, unknown>[];
            if (Array.isArray(parsed) && parsed.length > 0) {
                return this.jsonToResult(parsed, maxRows, elapsed, sql);
            }
        } catch { /* multi-statement or non-JSON */ }

        // Multi-statement cells produce multiple JSON arrays.
        // Find the LAST complete [...] JSON array in the output.
        let lastStart = -1;
        let lastEnd = -1;
        let depth = 0;
        for (let i = output.length - 1; i >= 0; i--) {
            if (output[i] === ']' && lastEnd === -1) { lastEnd = i; depth = 1; }
            else if (lastEnd !== -1) {
                if (output[i] === ']') { depth++; }
                if (output[i] === '[') { depth--; }
                if (depth === 0) { lastStart = i; break; }
            }
        }
        if (lastStart >= 0 && lastEnd > lastStart) {
            try {
                const parsed = JSON.parse(output.substring(lastStart, lastEnd + 1));
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return this.jsonToResult(parsed as Record<string, unknown>[], maxRows, elapsed, sql);
                }
            } catch { /* fall through */ }
        }

        // Pure DDL/DML — no JSON output
        const lines = output.split('\n').filter(l => l.trim());
        if (lines.length === 0) { return empty; }
        return { columns: ['result'], types: ['VARCHAR'], rows: lines.map(l => [l]), rowCount: lines.length, totalRows: lines.length, truncated: false, elapsed, statement: sql.slice(0, 100) };
    }

    private jsonToResult(parsed: Record<string, unknown>[], maxRows: number, elapsed: number, sql: string): QueryResult {
        const columns = Object.keys(parsed[0]);
        const types = columns.map(() => 'VARCHAR');
        const totalRows = parsed.length;
        const truncated = totalRows > maxRows;
        const rows = parsed.slice(0, maxRows).map(row => columns.map(col => row[col] ?? null));
        return { columns, types, rows, rowCount: rows.length, totalRows, truncated, elapsed, statement: sql.slice(0, 100) };
    }

    // ─── Public API ──────────────────────────────────────────────────────

    async query(sql: string): Promise<QueryResult> {
        if (this.useBinaryMode()) {
            return this.queryBinary(sql);
        }
        return this.queryNative(sql);
    }

    async dispose(): Promise<void> {
        if (this.connection) {
            this.connection.closeSync();
            this.connection = null;
        }
        if (this.instance) {
            this.instance.closeSync();
            this.instance = null;
        }
        if (this.proc && !this.proc.killed) {
            this.proc.stdin?.write('.quit\n');
            setTimeout(() => { try { this.proc?.kill(); } catch {} }, 1000);
            this.proc = null;
        }
    }
}
