# PlainSync desktop

PlainSync ships as a small, security-hardened Electron shell for macOS and Windows. It opens hosted PlainSync by default while keeping browser storage, downloads, and application settings in the desktop app's own profile.

## Download

Use the [latest GitHub release](https://github.com/everyai-com/plainsync/releases/latest):

- macOS Apple Silicon: `PlainSync-*-mac-arm64.dmg`
- macOS Intel: `PlainSync-*-mac-x64.dmg`
- Windows 64-bit: `PlainSync-*-win-x64.exe`

Alpha installers are not code-signed yet. macOS Gatekeeper and Windows SmartScreen may require a first-launch confirmation. Signing and notarization are planned before a stable release.

## Connect to your own server

Open **Server → Connect to another server** and enter the public URL of any PlainSync deployment. The selection is stored only in the desktop app profile.

Developers can override it for one launch:

```bash
PLAINSYNC_URL=https://docs.example.com npm run desktop
```

Or pass `--server-url=https://docs.example.com` to the packaged executable.

## Run the desktop app from source

```bash
npm install
npm run desktop
```

Create an unpacked development bundle:

```bash
npm run desktop:pack
```

Create the installer for the current operating system:

```bash
npm run desktop:dist
```

Artifacts are written to `release/` and are excluded from Git.

## Publish a release

The `Desktop release` GitHub Actions workflow builds macOS Intel, macOS Apple Silicon, and Windows installers whenever a `v*` tag is pushed. It creates the matching GitHub Release and uploads all installers automatically.

The shell disables Node.js in document pages, enables renderer sandboxing and context isolation, blocks embedded webviews, denies permission requests, and opens off-server links in the system browser. Forks can change the default hosted address in `desktop/main.cjs` or use their own deployment through the Server menu.
