import { DuckDBInstance, DuckDBConnection, DuckDBResultReader } from '@duckdb/node-api';
import * as vscode from 'vscode';

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

export class DuckDBConnectionManager {
    private instance: DuckDBInstance | null = null;
    private connection: DuckDBConnection | null = null;

    async ensureConnection(): Promise<DuckDBConnection> {
        if (!this.connection) {
            const dbPath = vscode.workspace.getConfiguration('duckdb-notebook').get<string>('databasePath', ':memory:');
            this.instance = await DuckDBInstance.create(dbPath);
            this.connection = await this.instance.connect();
        }
        return this.connection;
    }

    async query(sql: string): Promise<QueryResult> {
        const maxRows = vscode.workspace.getConfiguration('duckdb-notebook').get<number>('maxRows', 1000);
        const conn = await this.ensureConnection();
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
            rowCount: rows.length,
            totalRows,
            truncated,
            elapsed,
            statement: sql.slice(0, 100),
        };
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
