# DuckDB Notebook for VS Code

Interactive SQL notebooks powered by [DuckDB](https://duckdb.org/) — write, execute, and visualize SQL queries in a notebook-style interface with language server support.

## Features

- **📓 Notebook interface** — `.duckdb-notebook` files with code + markdown cells
- **⚡ DuckDB execution** — Run SQL cells against an in-memory DuckDB instance
- **🎨 Rich result tables** — Query results rendered as styled HTML tables
- **💡 SQL IntelliSense** — Autocomplete for SQL keywords, DuckDB functions, and types
- **🔍 Hover documentation** — Hover over functions to see signatures and descriptions
- **⚠️ Diagnostics** — Warnings for common SQL mistakes (unclosed strings, trailing commas)
- **📂 File queries** — Read CSV, Parquet, JSON files directly with DuckDB's I/O functions

## Getting Started

1. Open the command palette (`Ctrl+Shift+P`) → **DuckDB: New DuckDB Notebook**
2. Or open any `.duckdb-notebook` or `.ddb` file
3. Write SQL in code cells, execute with `Shift+Enter` or the ▶ button
4. Add markdown cells for documentation

## Example

```sql
-- Create and query data
CREATE TABLE sales (product VARCHAR, amount DECIMAL, region VARCHAR);
INSERT INTO sales VALUES ('Widget', 99.99, 'East'), ('Gadget', 149.50, 'West');

SELECT region, SUM(amount) AS total FROM sales GROUP BY region;
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `duckdb-notebook.maxRows` | `1000` | Maximum rows to display |
| `duckdb-notebook.databasePath` | `:memory:` | Database path (`:memory:` for in-memory) |
| `duckdb-notebook.binaryPath` | `""` | Path to custom DuckDB binary with extensions (e.g. sstream) |

## SStream Extension Support

To query Cosmos Structured Stream (`.ss`) files, point `binaryPath` to a DuckDB binary that includes the sstream extension:

```jsonc
// .vscode/settings.json
{
    "duckdb-notebook.binaryPath": "D:/repos/duckdb1/build/release/Release/duckdb.exe"
}
```

Then use sstream functions in notebook cells:

```sql
-- Read metadata
SELECT * FROM sstream_metadata('path/to/file.ss');

-- Read data (V2-V4 Legacy, V6 Parquet-embedded)
SELECT * FROM sstream_scan('path/to/file.ss') LIMIT 100;

-- Auto-detect .ss files
SELECT * FROM 'path/to/file.ss' LIMIT 100;
```

## Development

```bash
npm install
npm run compile    # Build
# Press F5 in VS Code to launch Extension Development Host
```
