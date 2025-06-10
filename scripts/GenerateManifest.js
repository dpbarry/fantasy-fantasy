import fs from 'fs';
import path from 'path';

const assetDir = path.resolve('C:\\Users\\Dean\\Documents\\Coding\\FantasyFantasy\\assets');
const output = {};

function walkDir(dir, base = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const relPath = path.join(base, entry.name);
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(fullPath, relPath);
        } else {
            output[relPath.replace(/\\/g, '/')] = `/assets/${relPath.replace(/\\/g, '/')}`;
        }
    }
}

walkDir(assetDir);

fs.writeFileSync('C:\\Users\\Dean\\Documents\\Coding\\FantasyFantasy\\manifest.json', JSON.stringify(output, null, 2));
console.log('manifest.json generated.');
