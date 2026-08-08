const fs = require("node:fs");
const path = require("node:path");

const srcDir = path.resolve(__dirname, "../src");
const distDir = path.resolve(__dirname, "../dist");

// Mirror src SCSS files into dist, preserving relative paths.
function copyScss() {
  let copied = 0;
  let skipped = 0;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".scss")) {
        const relative = path.relative(srcDir, fullPath);
        const dest = path.join(distDir, relative);
        const destDir = path.dirname(dest);

        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        const srcContent = fs.readFileSync(fullPath);
        if (fs.existsSync(dest)) {
          const destContent = fs.readFileSync(dest);
          if (Buffer.compare(srcContent, destContent) === 0) {
            skipped += 1;
            continue;
          }
        }

        fs.writeFileSync(dest, srcContent);
        copied += 1;
      }
    }
  }

  if (fs.existsSync(srcDir)) {
    walk(srcDir);
  }

  console.log(
    `SCSS sync: ${copied} copied, ${skipped} unchanged (${copied + skipped} total)`,
  );
}

copyScss();
