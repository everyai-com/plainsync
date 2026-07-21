/* eslint-disable @typescript-eslint/no-require-imports -- Electron preload runs as CommonJS. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("plainSyncDesktop", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveServer: (serverUrl) => ipcRenderer.invoke("settings:save", serverUrl),
  useHosted: () => ipcRenderer.invoke("settings:hosted"),
});
