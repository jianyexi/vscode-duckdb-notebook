import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

const DUCKDB_RELEASES_URL = 'https://github.com/duckdb/duckdb/releases';

interface PlatformAsset {
    asset: string;
    binary: string;
}

function getPlatformAsset(): PlatformAsset {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') {
        const suffix = arch === 'arm64' ? 'windows-arm64' : 'windows-amd64';
        return { asset: `duckdb_cli-${suffix}.zip`, binary: 'duckdb.exe' };
    } else if (platform === 'darwin') {
        return { asset: 'duckdb_cli-osx-universal.zip', binary: 'duckdb' };
    } else {
        const suffix = arch === 'arm64' ? 'linux-aarch64' : 'linux-amd64';
        return { asset: `duckdb_cli-${suffix}.zip`, binary: 'duckdb' };
    }
}

function followRedirects(url: string, dest: string, maxRedirects = 10): Promise<void> {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            reject(new Error('Too many redirects'));
            return;
        }

        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, { headers: { 'User-Agent': 'vscode-duckdb-notebook' } }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const location = response.headers.location;
                if (location) {
                    response.resume(); // drain response
                    followRedirects(location, dest, maxRedirects - 1).then(resolve, reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`Download failed: HTTP ${response.statusCode}`));
                return;
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => { file.close(() => resolve()); });
            file.on('error', (err) => {
                fs.unlink(dest, () => {}); // cleanup partial file
                reject(err);
            });
        }).on('error', reject);
    });
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (process.platform === 'win32') {
            cp.exec(
                `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force"`,
                (err) => err ? reject(err) : resolve()
            );
        } else {
            cp.exec(
                `unzip -o "${zipPath}" -d "${destDir}"`,
                (err) => err ? reject(err) : resolve()
            );
        }
    });
}

/**
 * Returns the path to the downloaded DuckDB binary, or null if not found.
 */
export function getDownloadedBinaryPath(context: vscode.ExtensionContext): string | null {
    const { binary } = getPlatformAsset();
    const binaryPath = path.join(context.globalStorageUri.fsPath, binary);
    if (fs.existsSync(binaryPath)) {
        return binaryPath;
    }
    return null;
}

/**
 * Downloads the DuckDB CLI binary for the current platform.
 * Returns the path to the extracted binary.
 */
export async function downloadDuckDB(
    context: vscode.ExtensionContext,
    version?: string
): Promise<string> {
    const { asset, binary } = getPlatformAsset();
    const storageDir = context.globalStorageUri.fsPath;

    await fs.promises.mkdir(storageDir, { recursive: true });

    const url = version
        ? `${DUCKDB_RELEASES_URL}/download/${version}/${asset}`
        : `${DUCKDB_RELEASES_URL}/latest/download/${asset}`;

    const zipPath = path.join(storageDir, asset);
    const binaryPath = path.join(storageDir, binary);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'DuckDB',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ message: `Downloading DuckDB CLI (${asset})...` });
            await followRedirects(url, zipPath);

            progress.report({ message: 'Extracting...' });
            await extractZip(zipPath, storageDir);

            // Cleanup zip
            await fs.promises.unlink(zipPath).catch(() => {});

            // Make executable on Unix
            if (process.platform !== 'win32') {
                await fs.promises.chmod(binaryPath, 0o755);
            }

            progress.report({ message: 'Done!' });
        }
    );

    return binaryPath;
}
