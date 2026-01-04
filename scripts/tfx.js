const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const binDir = path.join(rootDir, "node_modules", ".bin");
const isWindows = process.platform === "win32";

const [command, configName] = process.argv.slice(2);

if (!command || !configName) {
  console.error("Usage: node scripts/tfx.js <create|publish> <dev|ppe|prod>");
  process.exit(1);
}

const tfxLocal = path.join(binDir, isWindows ? "tfx.ps1" : "tfx");
const tfxCmd = resolveTfx(tfxLocal);

const baseManifest = path.join(rootDir, "ado-manifests", "azure-devops-extension-base.json");
const overrides = path.join(
  rootDir,
  "ado-manifests",
  `azure-devops-extension-${configName}.json`
);

const args = [
  "extension",
  command === "create" ? "create" : "publish",
  "--manifests",
  baseManifest,
  "--overrides-file",
  overrides
];

const result = spawnSync(...buildSpawnCommand(tfxCmd, args), {
  stdio: "inherit",
  shell: false
});

if (result.error) {
  console.error(
    "Unable to run tfx. Install it with: npm install -g tfx-cli"
  );
  process.exit(1);
}

process.exit(result.status || 0);

function resolveTfx(localPath) {
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  const globalPath = getGlobalTfxPath();
  if (globalPath && fs.existsSync(globalPath)) {
    return globalPath;
  }

  return isWindows ? "tfx.ps1" : "tfx";
}

function getGlobalTfxPath() {
  try {
    const npmPrefix = spawnSync("npm", ["config", "get", "prefix"], {
      encoding: "utf8",
      shell: true
    });
    const prefix = (npmPrefix.stdout || "").trim();
    if (!prefix) {
      return null;
    }
    return isWindows
      ? path.join(prefix, "tfx.ps1")
      : path.join(prefix, "bin", "tfx");
  } catch (error) {
    return null;
  }
}

function buildSpawnCommand(tfxPath, tfxArgs) {
  if (isWindows && tfxPath.toLowerCase().endsWith(".ps1")) {
    return ["powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tfxPath, ...tfxArgs]];
  }

  return [tfxPath, tfxArgs];
}
