/**
 * Postinstall script: patches clude-bot library to use Gemini instead of Anthropic.
 * Replaces claude-client.js and cortex.js with Gemini-compatible versions.
 */
const fs = require('fs');
const path = require('path');

const patchDir = path.join(__dirname, '..', 'patches');
const targetDir = path.join(__dirname, '..', 'node_modules', 'clude-bot', 'dist');

const patches = [
    { src: 'claude-client.js', dest: path.join('core', 'claude-client.js') },
    { src: 'cortex.js', dest: path.join('sdk', 'cortex.js') },
];

let patched = 0;
for (const { src, dest } of patches) {
    const srcPath = path.join(patchDir, src);
    const destPath = path.join(targetDir, dest);

    if (!fs.existsSync(srcPath)) {
        console.log(`[patch] SKIP: ${srcPath} not found`);
        continue;
    }
    if (!fs.existsSync(path.dirname(destPath))) {
        console.log(`[patch] SKIP: target dir ${path.dirname(destPath)} not found`);
        continue;
    }

    fs.copyFileSync(srcPath, destPath);
    console.log(`[patch] ✅ ${dest} patched with Gemini support`);
    patched++;
}

console.log(`[patch] Done: ${patched}/${patches.length} files patched.`);
