const { app, BrowserWindow, shell } = require("electron");
const { pathToFileURL } = require("url");
const path = require("path");

const DESKTOP_PORT = process.env.PORT || "41731";

async function createWindow() {
  const rootDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  const serverEntry = path.join(rootDir, "server", "dist", "index.js");
  const clientDist = path.join(rootDir, "client", "dist");

  process.env.PORT = DESKTOP_PORT;
  process.env.CLIENT_DIST_DIR = clientDist;
  process.env.CLIENT_ORIGIN = `http://127.0.0.1:${DESKTOP_PORT}`;

  await import(pathToFileURL(serverEntry).href);
  await waitForServer(`http://127.0.0.1:${DESKTOP_PORT}/api/health`);

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: "Beneficiarios Drive",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await window.loadURL(`http://127.0.0.1:${DESKTOP_PORT}`);
}

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error(error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error(error);
      app.quit();
    });
  }
});

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting while Express starts inside Electron.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("No se pudo iniciar el servidor local de Beneficiarios Drive.");
}
