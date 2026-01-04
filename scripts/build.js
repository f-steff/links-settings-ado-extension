const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const isProduction = args.includes("--mode=production");

const rootDir = path.join(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

build()
  .then(() => copyAssets())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function build() {
  await esbuild.build({
    entryPoints: [
      path.join(srcDir, "hub.ts"),
      path.join(srcDir, "header.ts")
    ],
    outdir: distDir,
    bundle: true,
    format: "iife",
    target: "es2019",
    entryNames: "[name]/[name]",
    sourcemap: !isProduction,
    minify: isProduction,
    define: {
      __DEV__: isProduction ? "false" : "true"
    },
    logLevel: "info"
  });
}

function copyAssets() {
  const patterns = [".html", ".css"];
  const files = walkFiles(srcDir);

  files
    .filter((file) => patterns.includes(path.extname(file)))
    .forEach((file) => {
      const relativePath = path.relative(srcDir, file);
      const outPath = path.join(distDir, relativePath);
      const outDir = path.dirname(outPath);
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(file, outPath);
    });
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}
