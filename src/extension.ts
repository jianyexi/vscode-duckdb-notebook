import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { DuckDBNotebookSerializer } from './serializer';
import { DuckDBController } from './controller';

const NOTEBOOK_TYPE = 'duckdb-notebook';

let client: LanguageClient | undefined;
let controller: DuckDBController | undefined;

export function activate(context: vscode.ExtensionContext) {
    // 1. Register notebook serializer
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer(
            NOTEBOOK_TYPE,
            new DuckDBNotebookSerializer(),
            { transientOutputs: true }
        )
    );

    // 2. Create notebook controller
    controller = new DuckDBController();
    context.subscriptions.push({ dispose: () => controller?.dispose() });

    // 3. Start language server
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
            { notebookType: NOTEBOOK_TYPE, language: 'duckdb-sql' },
        ],
    };

    client = new LanguageClient(
        'duckdb-sql-language-server',
        'DuckDB SQL Language Server',
        serverOptions,
        clientOptions
    );
    client.start();

    // 4. Register "New DuckDB Notebook" command
    context.subscriptions.push(
        vscode.commands.registerCommand('duckdb-notebook.new', async () => {
            const cell = new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                '-- Welcome to DuckDB Notebook!\nSELECT version();',
                'duckdb-sql'
            );
            const data = new vscode.NotebookData([cell]);
            data.metadata = { duckdb: true };
            const doc = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, data);
            await vscode.window.showNotebookDocument(doc);
        })
    );

    // 5. Status bar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(database) DuckDB';
    statusBar.tooltip = 'DuckDB Notebook Active';
    statusBar.show();
    context.subscriptions.push(statusBar);
}

export function deactivate(): Thenable<void> | undefined {
    controller?.dispose();
    return client?.stop();
}
