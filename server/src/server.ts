import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    CompletionItem,
    CompletionItemKind,
    Hover,
    MarkupKind,
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ─── SQL Keywords ───────────────────────────────────────────────────────────

const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
    'ALTER', 'TABLE', 'VIEW', 'INDEX', 'INTO', 'VALUES', 'SET', 'JOIN',
    'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS', 'ON', 'AS', 'AND',
    'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'TRUE',
    'FALSE', 'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT',
    'OFFSET', 'UNION', 'ALL', 'INTERSECT', 'EXCEPT', 'DISTINCT', 'CASE',
    'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'CAST', 'WITH', 'RECURSIVE',
    'WINDOW', 'OVER', 'PARTITION', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING',
    'FOLLOWING', 'CURRENT', 'ROW', 'QUALIFY', 'PIVOT', 'UNPIVOT', 'LATERAL',
    'USING', 'NATURAL', 'RETURNING', 'CONFLICT', 'DO', 'NOTHING', 'REPLACE',
    'TEMPORARY', 'TEMP', 'SCHEMA', 'DATABASE', 'SEQUENCE', 'TYPE', 'MACRO',
    'FUNCTION', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'COPY',
    'EXPORT', 'IMPORT', 'ATTACH', 'DETACH', 'DESCRIBE', 'EXPLAIN', 'ANALYZE',
    'VACUUM', 'PRAGMA', 'INSTALL', 'LOAD', 'CALL', 'PREPARE', 'EXECUTE',
    'DEALLOCATE', 'SUMMARIZE', 'POSITIONAL', 'ASOF',
];

const DUCKDB_FUNCTIONS: Record<string, string> = {
    // Aggregate
    'COUNT': 'count(expr) → BIGINT\nCount non-null values. count(*) counts all rows.',
    'SUM': 'sum(expr) → numeric\nCompute sum of non-null values.',
    'AVG': 'avg(expr) → DOUBLE\nCompute average of non-null values.',
    'MIN': 'min(expr) → same type\nReturn minimum value.',
    'MAX': 'max(expr) → same type\nReturn maximum value.',
    'STRING_AGG': 'string_agg(expr, separator) → VARCHAR\nConcatenate strings with separator.',
    'LIST': 'list(expr) → LIST\nCollect values into a list.',
    'FIRST': 'first(expr) → same type\nReturn first non-null value.',
    'LAST': 'last(expr) → same type\nReturn last non-null value.',
    'STDDEV': 'stddev(expr) → DOUBLE\nCompute sample standard deviation.',
    'VARIANCE': 'variance(expr) → DOUBLE\nCompute sample variance.',
    'MEDIAN': 'median(expr) → same type\nCompute median value.',
    'MODE': 'mode(expr) → same type\nReturn most frequent value.',
    'QUANTILE_CONT': 'quantile_cont(expr, quantile) → DOUBLE\nCompute continuous quantile.',
    'PERCENTILE_CONT': 'percentile_cont(quantile) WITHIN GROUP (ORDER BY expr)\nCompute continuous percentile.',
    'APPROX_COUNT_DISTINCT': 'approx_count_distinct(expr) → BIGINT\nApproximate distinct count using HLL.',
    'ARG_MIN': 'arg_min(arg, val) → same as arg\nReturn arg for row with minimum val.',
    'ARG_MAX': 'arg_max(arg, val) → same as arg\nReturn arg for row with maximum val.',
    // Window
    'ROW_NUMBER': 'row_number() → BIGINT\nSequential row number within partition.',
    'RANK': 'rank() → BIGINT\nRank with gaps for ties.',
    'DENSE_RANK': 'dense_rank() → BIGINT\nRank without gaps.',
    'NTILE': 'ntile(n) → BIGINT\nDivide rows into n buckets.',
    'LAG': 'lag(expr, offset, default) → same type\nAccess previous row value.',
    'LEAD': 'lead(expr, offset, default) → same type\nAccess next row value.',
    'FIRST_VALUE': 'first_value(expr) → same type\nFirst value in window frame.',
    'LAST_VALUE': 'last_value(expr) → same type\nLast value in window frame.',
    'NTH_VALUE': 'nth_value(expr, n) → same type\nNth value in window frame.',
    'PERCENT_RANK': 'percent_rank() → DOUBLE\nRelative rank (0 to 1).',
    'CUME_DIST': 'cume_dist() → DOUBLE\nCumulative distribution.',
    // Scalar
    'COALESCE': 'coalesce(expr, ...) → first non-null\nReturn first non-null argument.',
    'NULLIF': 'nullif(a, b) → a or NULL\nReturn NULL if a = b.',
    'IFNULL': 'ifnull(expr, alt) → expr or alt\nReturn alt if expr is NULL.',
    'GREATEST': 'greatest(a, b, ...) → max value\nReturn greatest of arguments.',
    'LEAST': 'least(a, b, ...) → min value\nReturn least of arguments.',
    'ABS': 'abs(x) → numeric\nAbsolute value.',
    'ROUND': 'round(x, n) → numeric\nRound to n decimal places.',
    'CEIL': 'ceil(x) → numeric\nRound up to nearest integer.',
    'FLOOR': 'floor(x) → numeric\nRound down to nearest integer.',
    'LENGTH': 'length(s) → INTEGER\nString length in characters.',
    'LOWER': 'lower(s) → VARCHAR\nConvert to lowercase.',
    'UPPER': 'upper(s) → VARCHAR\nConvert to uppercase.',
    'TRIM': 'trim(s) → VARCHAR\nRemove leading/trailing whitespace.',
    'LTRIM': 'ltrim(s) → VARCHAR\nRemove leading whitespace.',
    'RTRIM': 'rtrim(s) → VARCHAR\nRemove trailing whitespace.',
    'REPLACE': 'replace(s, from, to) → VARCHAR\nReplace occurrences.',
    'SUBSTRING': 'substring(s, start, length) → VARCHAR\nExtract substring.',
    'CONCAT': 'concat(a, b, ...) → VARCHAR\nConcatenate strings.',
    'SPLIT_PART': 'split_part(s, delimiter, index) → VARCHAR\nSplit and return nth part.',
    'REGEXP_MATCHES': 'regexp_matches(s, pattern) → BOOLEAN\nTest regex match.',
    'REGEXP_EXTRACT': 'regexp_extract(s, pattern, group) → VARCHAR\nExtract regex match.',
    'STRFTIME': 'strftime(format, timestamp) → VARCHAR\nFormat timestamp as string.',
    'STRPTIME': 'strptime(s, format) → TIMESTAMP\nParse string as timestamp.',
    'DATE_TRUNC': 'date_trunc(part, date) → TIMESTAMP\nTruncate to date part.',
    'DATE_PART': 'date_part(part, date) → BIGINT\nExtract date part.',
    'DATE_DIFF': 'date_diff(part, start, end) → BIGINT\nDifference between dates.',
    'CURRENT_DATE': 'current_date → DATE\nCurrent date.',
    'CURRENT_TIMESTAMP': 'current_timestamp → TIMESTAMP\nCurrent timestamp.',
    'NOW': 'now() → TIMESTAMP WITH TIME ZONE\nCurrent timestamp.',
    'EPOCH': 'epoch(ts) → BIGINT\nConvert timestamp to epoch seconds.',
    'GENERATE_SERIES': 'generate_series(start, stop, step) → TABLE\nGenerate a series of values.',
    'UNNEST': 'unnest(list) → TABLE\nExpand a list to rows.',
    'RANGE': 'range(start, stop, step) → LIST\nGenerate list of integers.',
    'LIST_VALUE': 'list_value(a, b, ...) → LIST\nCreate a list from values.',
    'STRUCT_PACK': 'struct_pack(k := v, ...) → STRUCT\nCreate a struct.',
    'MAP': 'map(keys, values) → MAP\nCreate a map from two lists.',
    // I/O
    'READ_CSV': 'read_csv(path, ...) → TABLE\nRead CSV file(s).',
    'READ_CSV_AUTO': 'read_csv_auto(path) → TABLE\nRead CSV with auto-detection.',
    'READ_PARQUET': 'read_parquet(path, ...) → TABLE\nRead Parquet file(s).',
    'READ_JSON': 'read_json(path, ...) → TABLE\nRead JSON file(s).',
    'READ_JSON_AUTO': 'read_json_auto(path) → TABLE\nRead JSON with auto-detection.',
    // SStream extension
    'SSTREAM_SCAN': "sstream_scan(path) → TABLE\nRead a Cosmos Structured Stream (.ss) file.\nSupports V2-V4 embedded data (Legacy & Parquet) and V6 Parquet-embedded.\n\nOptions:\n  partition_filter: VARCHAR — comma-separated partition indices\n  column_group_filter: VARCHAR — comma-separated column group indices\n\nExample:\n  SELECT * FROM sstream_scan('data.ss');\n  SELECT * FROM sstream_scan('data.ss', partition_filter='0,1');",
    'READ_SSTREAM': "read_sstream(path) → TABLE\nAlias for sstream_scan(). Read a Cosmos Structured Stream (.ss) file.\n\nExample:\n  SELECT * FROM read_sstream('data.ss');",
    'SSTREAM_METADATA': "sstream_metadata(path) → TABLE\nRead metadata from a Structured Stream (.ss) file.\n\nReturns: file_path, version, partition_count, column_group_count,\n  total_row_count, data_unit_count, schema_xml, data_format,\n  crc_valid, file_count, is_parquet_embedded\n\nExample:\n  SELECT * FROM sstream_metadata('data.ss');",
    // Types
    'TRY_CAST': 'try_cast(expr AS type) → type or NULL\nCast with NULL on failure.',
    'TYPEOF': 'typeof(expr) → VARCHAR\nReturn type name of expression.',
    'COLUMNS': 'columns(pattern) → expanded columns\nSelect columns matching pattern.',
    'EXCLUDE': 'SELECT * EXCLUDE (col) → all but col\nExclude columns from SELECT *.',
};

const DUCKDB_TYPES = [
    'BOOLEAN', 'TINYINT', 'SMALLINT', 'INTEGER', 'INT', 'BIGINT', 'HUGEINT',
    'UTINYINT', 'USMALLINT', 'UINTEGER', 'UBIGINT',
    'FLOAT', 'REAL', 'DOUBLE', 'DECIMAL', 'NUMERIC',
    'VARCHAR', 'TEXT', 'STRING', 'CHAR', 'BLOB', 'BYTEA',
    'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL',
    'UUID', 'JSON', 'MAP', 'LIST', 'STRUCT', 'UNION', 'ENUM', 'BIT',
];

// ─── Initialize ─────────────────────────────────────────────────────────────

connection.onInitialize((_params: InitializeParams): InitializeResult => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', ' '],
            },
            hoverProvider: true,
        },
    };
});

// ─── Completion ─────────────────────────────────────────────────────────────

connection.onCompletion((_params): CompletionItem[] => {
    const items: CompletionItem[] = [];

    // SQL Keywords
    for (const kw of SQL_KEYWORDS) {
        items.push({
            label: kw,
            kind: CompletionItemKind.Keyword,
            detail: 'SQL Keyword',
            insertText: kw,
        });
    }

    // DuckDB functions
    for (const [name, doc] of Object.entries(DUCKDB_FUNCTIONS)) {
        items.push({
            label: name.toLowerCase(),
            kind: CompletionItemKind.Function,
            detail: 'DuckDB Function',
            documentation: { kind: MarkupKind.Markdown, value: '```\n' + doc + '\n```' },
            insertText: name.toLowerCase(),
        });
    }

    // Type keywords
    for (const t of DUCKDB_TYPES) {
        items.push({
            label: t,
            kind: CompletionItemKind.TypeParameter,
            detail: 'DuckDB Type',
            insertText: t,
        });
    }

    return items;
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return item;
});

// ─── Hover ──────────────────────────────────────────────────────────────────

connection.onHover((params): Hover | null => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) { return null; }

    const line = doc.getText({
        start: { line: params.position.line, character: 0 },
        end: { line: params.position.line, character: 1000 },
    });

    // Extract word under cursor
    const charPos = params.position.character;
    let start = charPos;
    let end = charPos;
    while (start > 0 && /\w/.test(line[start - 1])) { start--; }
    while (end < line.length && /\w/.test(line[end])) { end++; }
    const word = line.slice(start, end).toUpperCase();

    // Check functions
    if (word in DUCKDB_FUNCTIONS) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${word}** (DuckDB Function)\n\n\`\`\`\n${DUCKDB_FUNCTIONS[word]}\n\`\`\``,
            },
        };
    }

    // Check keywords
    if (SQL_KEYWORDS.includes(word)) {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${word}** — SQL keyword`,
            },
        };
    }

    return null;
});

// ─── Diagnostics ────────────────────────────────────────────────────────────

documents.onDidChangeContent((change) => {
    validateDocument(change.document);
});

function validateDocument(doc: TextDocument): void {
    const diagnostics: Diagnostic[] = [];
    const text = doc.getText();

    // Check for common SQL mistakes
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Unclosed string literals (simple heuristic)
        const singleQuotes = (line.match(/'/g) || []).length;
        if (singleQuotes % 2 !== 0) {
            const pos = line.lastIndexOf("'");
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: i, character: pos },
                    end: { line: i, character: pos + 1 },
                },
                message: 'Possibly unclosed string literal',
                source: 'duckdb-sql',
            });
        }

        // Trailing comma before FROM/WHERE/GROUP/ORDER
        if (/,\s*$/.test(line) && i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim().toUpperCase();
            if (/^(FROM|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|EXCEPT|INTERSECT)\b/.test(nextLine)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: i, character: line.lastIndexOf(',') },
                        end: { line: i, character: line.lastIndexOf(',') + 1 },
                    },
                    message: `Trailing comma before ${nextLine.split(/\s/)[0]}`,
                    source: 'duckdb-sql',
                });
            }
        }
    }

    connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

documents.listen(connection);
connection.listen();
