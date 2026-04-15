// Build platform-specific VSIX packages
// Usage: node build-platforms.js [targets...]
// Example: node build-platforms.js win32-x64 darwin-arm64 darwin-x64

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ALL_TARGETS = [
    'win32-x64',
    'win32-arm64',
    'darwin-x64',
    'darwin-arm64',
];

const targets = process.argv.slice(2);
const buildTargets = targets.length > 0 ? targets : ALL_TARGETS;

const nodeModules = path.join(__dirname, 'node_modules', '@duckdb');
const bindingsPkg = '@duckdb/node-bindings';

function run(cmd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: __dirname });
}

function getInstalledPlatformPkgs() {
    try {
        const dirs = fs.readdirSync(nodeModules);
        return dirs.filter(d => d.startsWith('node-bindings-'));
    } catch {
        return [];
    }
}

function removePlatformPkg(name) {
    const dir = path.join(nodeModules, name);
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function installPlatformPkg(target) {
    const pkg = `@duckdb/node-bindings-${target}`;
    const dir = path.join(nodeModules, `node-bindings-${target}`);
    if (!fs.existsSync(dir)) {
        // Install the exact version that matches the installed @duckdb/node-bindings
        const bindingsPkgJson = JSON.parse(
            fs.readFileSync(path.join(nodeModules, 'node-bindings', 'package.json'), 'utf8')
        );
        const version = bindingsPkgJson.optionalDependencies?.[pkg] || bindingsPkgJson.version;
        run(`npm install ${pkg}@${version} --no-save --force`);
    }
}

// Save original state
const originalPkgs = getInstalledPlatformPkgs();

console.log('\n=== Building platform-specific VSIX packages ===\n');
console.log(`Targets: ${buildTargets.join(', ')}\n`);

// Compile once
run('npm run compile');

const results = [];

for (const target of buildTargets) {
    console.log(`\n--- Building for ${target} ---\n`);

    // Remove all platform-specific bindings
    for (const pkg of getInstalledPlatformPkgs()) {
        removePlatformPkg(pkg);
    }

    // Install only the target platform binding
    installPlatformPkg(target);

    // Package with target
    try {
        run(`npx @vscode/vsce package --target ${target}`);
        const version = require('./package.json').version;
        const name = require('./package.json').name;
        results.push({ target, file: `${name}-${target}-${version}.vsix`, success: true });
    } catch (err) {
        results.push({ target, error: err.message, success: false });
    }
}

// Restore: remove all and reinstall originals
console.log('\n--- Restoring original platform bindings ---\n');
for (const pkg of getInstalledPlatformPkgs()) {
    removePlatformPkg(pkg);
}
run('npm install --force');

console.log('\n=== Build Summary ===\n');
for (const r of results) {
    if (r.success) {
        console.log(`  ✓ ${r.target}: ${r.file}`);
    } else {
        console.log(`  ✗ ${r.target}: ${r.error}`);
    }
}
