import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { DuckDBController } from './controller';
import { downloadDuckDB, getDownloadedBinaryPath } from './duckdb-downloader';

let client: LanguageClient | undefined;
let controller: DuckDBController | undefined;

export function activate(context: vscode.ExtensionContext) {
    // 1. Create notebook controller for Jupyter notebooks
    controller = new DuckDBController();
    context.subscriptions.push({ dispose: () => controller?.dispose() });

    // 2. Start language server
    const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] },
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: 'duckdb-sql' },
            { language: 'sql', scheme: 'vscode-notebook-cell' },
        ],
    };

    client = new LanguageClient(
        'duckdb-sql-language-server',
        'DuckDB SQL Language Server',
        serverOptions,
        clientOptions
    );
    client.start();

    // 3. Register "New DuckDB Notebook" command
    context.subscriptions.push(
        vscode.commands.registerCommand('duckdb-notebook.new', async () => {
            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    '# DuckDB Notebook\n\nWelcome to your DuckDB Jupyter notebook! Execute SQL queries using the DuckDB SQL kernel.',
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    '-- Check DuckDB version\nSELECT version() AS duckdb_version;',
                    'sql'
                )
            ];
            const data = new vscode.NotebookData(cells);
            data.metadata = {
                kernelspec: {
                    name: 'duckdb-kernel',
                    display_name: 'DuckDB SQL'
                },
                language_info: {
                    name: 'sql',
                    version: ''
                }
            };
            const doc = await vscode.workspace.openNotebookDocument('jupyter-notebook', data);
            await vscode.window.showNotebookDocument(doc);
        })
    );

    // 4. Register "Download DuckDB Binary" command
    context.subscriptions.push(
        vscode.commands.registerCommand('duckdb-notebook.downloadBinary', async () => {
            try {
                const config = vscode.workspace.getConfiguration('duckdb-notebook');
                const version = config.get<string>('binaryVersion', '');
                const binaryPath = await downloadDuckDB(context, version || undefined);
                await config.update('binaryPath', binaryPath, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`DuckDB CLI downloaded to: ${binaryPath}`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Failed to download DuckDB: ${msg}`);
            }
        })
    );

    // 5. Auto-download DuckDB binary if binaryPath is "auto"
    const binaryPathConfig = vscode.workspace.getConfiguration('duckdb-notebook').get<string>('binaryPath', '');
    if (binaryPathConfig === 'auto') {
        const existing = getDownloadedBinaryPath(context);
        if (!existing) {
            vscode.commands.executeCommand('duckdb-notebook.downloadBinary');
        } else {
            // Already downloaded — ensure config points to it
            vscode.workspace.getConfiguration('duckdb-notebook')
                .update('binaryPath', existing, vscode.ConfigurationTarget.Global);
        }
    }

    // 6. Status bar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(database) DuckDB';
    statusBar.tooltip = 'DuckDB Jupyter Kernel Active';
    statusBar.show();
    context.subscriptions.push(statusBar);
}

export function deactivate(): Thenable<void> | undefined {
    controller?.dispose();
    return client?.stop();
}
