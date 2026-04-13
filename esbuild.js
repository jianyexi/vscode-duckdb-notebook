// @ts-check
const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const extensionConfig = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode', '@duckdb/node-api'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: true,
    minify: false,
};

/** @type {esbuild.BuildOptions} */
const serverConfig = {
    entryPoints: ['server/src/server.ts'],
    bundle: true,
    outfile: 'dist/server.js',
    external: ['@duckdb/node-api'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: true,
    minify: false,
};

async function main() {
    if (isWatch) {
        const extCtx = await esbuild.context(extensionConfig);
        const srvCtx = await esbuild.context(serverConfig);
        await Promise.all([extCtx.watch(), srvCtx.watch()]);
        console.log('Watching for changes...');
    } else {
        await Promise.all([
            esbuild.build(extensionConfig),
            esbuild.build(serverConfig),
        ]);
        console.log('Build complete.');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
