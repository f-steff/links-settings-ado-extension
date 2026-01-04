## Development Setup

This project is an Azure DevOps extension that provides a settings page to manage links. Links are rendered as a non-dismissable banner with clickable anchors and are filtered by organization and project based on the current URL.

### Prerequisites

- Node.js (LTS)
- Visual Studio Marketplace CLI: `npm install -g tfx-cli`
- An Azure DevOps organization
- A Marketplace publisher and PAT with `Marketplace (Publish)` scope

### Editor Setup

VS Code (recommended):
- Extensions: ESLint

Notepad++ is fine for editing, but linting and TypeScript tooling are better in VS Code.

### Install Dependencies

    Remove-Item -Recurse -Force .\node_modules
    Remove-Item -Force .\package-lock.json
    npm install
    npm audit

### Build

    npm run build:dev

Outputs:
- `dist/index.html` (settings hub)
- `dist/**.js` bundles

### Package

    npm run package:dev

This creates a VSIX in the repo root.

If `tfx` is not found, add the global npm bin path to PATH:

    $env:Path += ";$env:USERPROFILE\AppData\Roaming\npm"

To persist it, add `%USERPROFILE%\AppData\Roaming\npm` to the user `Path` in Environment Variables and reopen PowerShell.

### Install in Azure DevOps

1) Organization settings -> Extensions -> Manage extensions -> Upload.
2) Select the generated `.vsix`.
3) Enable the extension for the organization.
4) Open Organization settings -> Header Links and add link entries.

### Publishing

1) Install the Visual Studio Marketplace CLI (`tfx`) globally (required for package/publish commands):

    npm install -g tfx-cli

2) Ensure you have a Marketplace publisher and a PAT with extension publish rights:
   - Create/verify publisher: https://marketplace.visualstudio.com/manage/publishers
   - Create PAT (Organization settings -> Personal access tokens) with scope: `Marketplace (Publish)`

3) Build and package:

    npm run build:prod
    npm run package:prod

4) Publish (set the PAT in the environment or pass it in):

    $env:TFS_PAT = "<your-pat>"
    npm run publish:prod

### Debugging

- Open the settings hub: Organization settings -> Header Links.
- Use browser devtools (F12) to inspect the UI and console logs.
- After changes:
  1) `npm run build:dev`
  2) `npm run package:dev`
  3) Upload the new VSIX
  4) Reload the page

### Instrumentation (Dev vs Prod)

- `npm run build:dev` enables verbose logging (debug/info/warn/error) in both the hub and header injection.
- `npm run build:prod` limits logging to warnings and errors.
- Logs are prefixed with `[links-ext]` so they are easy to filter in DevTools.

### Troubleshooting

- `tfx` not found: install `tfx-cli` globally and ensure the npm bin path is on PATH.
- Packaging errors: confirm `LICENSE` exists and manifests are valid.

## Project Layout

This section is a quick map of the repository so you can understand how the parts connect. Auto-generated folders are called out explicitly.

- `ado-manifests/`: Extension manifests for dev/PPE/prod. These reference `dist/index.html` for the settings hub and `dist/dynamic-banner.html` for the dynamic banner event subscription.
- `scripts/`: Tooling for build and packaging.
  - `scripts/build.js`: Bundles `src/hub.ts` and `src/header.ts` with esbuild, copies `src/*.html` and `src/*.css`.
  - `scripts/serve.js`: Local static server for quick checks.
  - `scripts/tfx.js`: Wrapper around `tfx` to create/publish VSIX packages.
- `src/`: Source code for the extension.
  - `src/index.html`: Settings hub entry point. Loads `hub.js` and styles.
  - `src/hub.ts`: Settings UI logic (table of links, save/delete, org/project filters).
  - `src/hub.css`: Styling for the settings table and layout.
  - `src/dynamic-banner.html`: Event subscription entry point that loads `header.js` in a background iframe.
  - `src/header.ts`: Dynamic banner logic. Reads settings, filters by URL, and calls the global message service.
  - `src/common/log.ts`: Shared logging helpers with dev/prod verbosity control.
  - `src/models/header-links.ts`: Link model and serialization to the settings API.
  - `src/services/ado-service.ts`: REST calls to Azure DevOps for settings and project lists.
- `static/`: Packaged assets referenced by the manifests and README.
  - `static/icon.png`: Extension icon.
  - `static/screenshot.png`: Screenshot shown in README.
- `dist/`: Auto-generated build output created by `scripts/build.js`. Not committed; contains the bundled JS plus copied HTML/CSS assets referenced by the manifests.
- `azure-pipelines.yml`: CI pipeline configuration.
- `eslint.config.js`: ESLint configuration.
- `LICENSE`: MIT license text used by the marketplace manifest.
- `README.md`: Project overview and usage notes.
- `SETUP.md`: Setup, build, and debugging guide.
- `codex.txt`: Running log of user requests and implementation notes.
- `package.json` / `package-lock.json`: Dependency and script definitions.
- `tsconfig.json`: TypeScript compiler settings (used by tooling and editor intellisense).
