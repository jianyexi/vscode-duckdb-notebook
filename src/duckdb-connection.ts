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

    // ─── Binary mode (custom duckdb.exe with extensions) ─────────────────

    private async queryBinary(sql: string): Promise<QueryResult> {
        const { binaryPath, maxRows, dbPath } = this.getConfig();
        const start = Date.now();

        // Build the command: pipe SQL into duckdb CLI with CSV output
        const limitedSql = `.mode json\n.headers on\n${sql}`;
        const result = await this.execDuckDB(binaryPath, dbPath, limitedSql);
        const elapsed = Date.now() - start;

        if (result.error) {
            throw new Error(result.error);
        }

        return this.parseJsonOutput(result.stdout, maxRows, elapsed, sql);
    }

    private execDuckDB(binaryPath: string, dbPath: string, sql: string): Promise<{ stdout: string; error: string }> {
        return new Promise((resolve) => {
            const args = dbPath !== ':memory:' ? [dbPath] : [];
            const proc = cp.spawn(binaryPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
            proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

            proc.on('close', () => {
                // DuckDB CLI outputs errors to stderr
                const error = stderr.trim();
                resolve({ stdout: stdout.trim(), error: error || '' });
            });

            proc.on('error', (err) => {
                resolve({ stdout: '', error: `Failed to start DuckDB: ${err.message}` });
            });

            proc.stdin.write(sql);
            proc.stdin.end();

            // Timeout after 60 seconds
            setTimeout(() => {
                try { proc.kill(); } catch { /* ignore */ }
                resolve({ stdout: '', error: 'Query timed out (60s)' });
            }, 60000);
        });
    }

    private parseJsonOutput(output: string, maxRows: number, elapsed: number, sql: string): QueryResult {
        if (!output) {
            return { columns: [], types: [], rows: [], rowCount: 0, totalRows: 0, truncated: false, elapsed, statement: sql.slice(0, 100) };
        }

        try {
            // DuckDB .mode json outputs a JSON array
            const parsed = JSON.parse(output) as Record<string, unknown>[];
            if (!Array.isArray(parsed) || parsed.length === 0) {
                return { columns: [], types: [], rows: [], rowCount: 0, totalRows: 0, truncated: false, elapsed, statement: sql.slice(0, 100) };
            }

            const columns = Object.keys(parsed[0]);
            const types = columns.map(() => 'VARCHAR'); // JSON mode doesn't preserve types
            const totalRows = parsed.length;
            const truncated = totalRows > maxRows;
            const rows = parsed.slice(0, maxRows).map(row =>
                columns.map(col => row[col] ?? null)
            );

            return { columns, types, rows, rowCount: rows.length, totalRows, truncated, elapsed, statement: sql.slice(0, 100) };
        } catch {
            // If JSON parsing fails, try to parse as plain text lines
            const lines = output.split('\n').filter(l => l.trim());
            if (lines.length === 0) {
                return { columns: [], types: [], rows: [], rowCount: 0, totalRows: 0, truncated: false, elapsed, statement: sql.slice(0, 100) };
            }
            return {
                columns: ['result'],
                types: ['VARCHAR'],
                rows: lines.map(l => [l]),
                rowCount: lines.length,
                totalRows: lines.length,
                truncated: false,
                elapsed,
                statement: sql.slice(0, 100),
            };
        }
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
    }
}
