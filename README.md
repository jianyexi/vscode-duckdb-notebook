# DuckDB Jupyter Kernel for VS Code

Interactive SQL notebooks powered by [DuckDB](https://duckdb.org/) — write, execute, and visualize SQL queries in Jupyter notebooks with a custom DuckDB kernel and language server support.

## Features

- **📓 Jupyter notebook support** — Standard `.ipynb` files with DuckDB SQL kernel
- **⚡ DuckDB execution** — Run SQL cells against an in-memory DuckDB instance
- **🎨 Rich result tables** — Query results rendered as styled HTML tables
- **💡 SQL IntelliSense** — Autocomplete for SQL keywords, DuckDB functions, and types
- **🔍 Hover documentation** — Hover over functions to see signatures and descriptions
- **⚠️ Diagnostics** — Warnings for common SQL mistakes (unclosed strings, trailing commas)
- **📂 File queries** — Read CSV, Parquet, JSON files directly with DuckDB's I/O functions

## Getting Started

1. Open the command palette (`Ctrl+Shift+P`) → **DuckDB: New DuckDB Jupyter Notebook**
2. Or create a new Jupyter notebook and select **DuckDB SQL** as the kernel
3. Or open any existing `.ipynb` file and choose the DuckDB SQL kernel
4. Write SQL in code cells, execute with `Shift+Enter` or the ▶ button
5. Add markdown cells for documentation

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
| `duckdb-notebook.binaryPath` | `""` | Path to a custom DuckDB binary with extensions |

## Development

```bash
npm install
npm run compile    # Build
# Press F5 in VS Code to launch Extension Development Host
```
