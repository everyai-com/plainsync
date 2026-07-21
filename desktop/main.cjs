/* eslint-disable @typescript-eslint/no-require-imports -- Electron loads the main process from CommonJS. */
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require("electron");
const { existsSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const DEFAULT_SERVER_URL = "https://plainsync-open-markdown.tradephani.chatgpt.site/";
const GITHUB_URL = "https://github.com/everyai-com/plainsync";

let mainWindow;
let settingsWindow;
let activeServerUrl;

function normalizeServerUrl(value) {
  const url = new URL(String(value).trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Use an http:// or https:// PlainSync address.");
  }
  if (url.username || url.password) {
    throw new Error("PlainSync addresses cannot include a username or password.");
  }
  url.hash = "";
  return url.toString();
}

function configPath() {
  return path.join(app.getPath("userData"), "server.json");
}

function commandLineServer() {
  const argument = process.argv.find((value) => value.startsWith("--server-url="));
  return argument?.slice("--server-url=".length) || process.env.PLAINSYNC_URL;
}

function readSavedServer() {
  if (!existsSync(configPath())) return null;
  try {
    const parsed = JSON.parse(readFileSync(configPath(), "utf8"));
    return normalizeServerUrl(parsed.serverUrl);
  } catch {
    return null;
  }
}

function configuredServer() {
  const requested = commandLineServer();
  if (requested) return normalizeServerUrl(requested);
  return readSavedServer() || DEFAULT_SERVER_URL;
}

function isSafeExternalUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function openExternal(value) {
  if (isSafeExternalUrl(value)) void shell.openExternal(value);
}

function loadServer(url) {
  activeServerUrl = normalizeServerUrl(url);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.loadURL(activeServerUrl).catch(showConnectionError);
}

function useHostedServer() {
  rmSync(configPath(), { force: true });
  loadServer(DEFAULT_SERVER_URL);
}

function showConnectionError() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const safeAddress = activeServerUrl.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>PlainSync is offline</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbfaf7;color:#22231f;font:15px system-ui,sans-serif}
main{width:min(520px,calc(100% - 48px));padding:36px;border:1px solid #dedbd2;border-radius:14px;background:#fffefd;box-shadow:0 24px 70px rgba(34,35,31,.09)}
h1{margin:0 0 12px;font-size:28px}p{color:#67685f;line-height:1.6}code{display:block;padding:12px;border-radius:8px;background:#f4f1eb;overflow-wrap:anywhere}
</style></head><body><main><h1>PlainSync could not connect.</h1><p>Check your internet connection or choose another self-hosted server from the <strong>Server</strong> menu.</p><code>${safeAddress}</code></main></body></html>`;
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: "PlainSync",
    width: 1380,
    height: 900,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: "#fbfaf7",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === new URL(activeServerUrl).origin) return { action: "allow" };
    } catch {
      return { action: "deny" };
    }
    openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === new URL(activeServerUrl).origin) return;
    } catch {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    openExternal(url);
  });

  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) showConnectionError();
  });

  loadServer(activeServerUrl);
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    title: "PlainSync server",
    width: 520,
    height: 430,
    resizable: false,
    modal: process.platform === "darwin",
    parent: mainWindow,
    backgroundColor: "#fbfaf7",
    webPreferences: {
      preload: path.join(__dirname, "settings-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  void settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => { settingsWindow = undefined; });
}

function installMenu() {
  const template = [];
  if (process.platform === "darwin") {
    template.push({ label: "PlainSync", submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] });
  }
  template.push(
    {
      label: "Server",
      submenu: [
        { label: "Connect to another server…", accelerator: "CmdOrCtrl+,", click: createSettingsWindow },
        { label: "Use hosted PlainSync", click: useHostedServer },
        { type: "separator" },
        { role: "reload" },
      ],
    },
    {
      label: "Edit",
      submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
    },
    {
      label: "View",
      submenu: [{ role: "togglefullscreen" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
    },
    {
      label: "Help",
      submenu: [
        { label: "PlainSync source", click: () => openExternal(GITHUB_URL) },
        { label: "Self-hosting guide", click: () => openExternal(`${GITHUB_URL}/blob/main/docs/SELF-HOSTING.md`) },
      ],
    },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("settings:get", () => ({
  current: activeServerUrl,
  hosted: DEFAULT_SERVER_URL,
}));

ipcMain.handle("settings:save", (_event, value) => {
  try {
    const serverUrl = normalizeServerUrl(value);
    writeFileSync(configPath(), `${JSON.stringify({ serverUrl }, null, 2)}\n`, { mode: 0o600 });
    loadServer(serverUrl);
    settingsWindow?.close();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "That server address is not valid." };
  }
});

ipcMain.handle("settings:hosted", () => {
  try {
    useHostedServer();
    settingsWindow?.close();
    return { ok: true };
  } catch {
    return { ok: false, message: "PlainSync could not reset the saved server." };
  }
});

app.whenReady().then(() => {
  app.setAppUserModelId("com.everyai.plainsync");
  activeServerUrl = configuredServer();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  installMenu();
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch((error) => {
  dialog.showErrorBox("PlainSync could not start", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
