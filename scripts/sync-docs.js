const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.resolve(__dirname, '..', 'miniapp', 'dist');
const TARGET_DIR = path.resolve(__dirname, '..', 'docs');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory not found: ${src}`);
  }

  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  copyDirRecursive(SOURCE_DIR, TARGET_DIR);
  console.log(`✅ Copied miniapp build from ${SOURCE_DIR} to ${TARGET_DIR}`);
}

main();

