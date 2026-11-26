// Sunny: a menu-bar icon and a small popover that set the luminosity boost. No dock icon, no other window.
// The page gets a narrow bridge (preload.ts) and nothing else.
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import path from "node:path";
import { DEFAULT_BOOST, isBoost, MIN_LEVEL, stepLevel, throttle } from "../src/level.ts";
import { BOOST_BIN, type BoostState, readLevel, readState, setLevel, watchState } from "./boost.ts";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");
const DEV_URL = process.env.SUNNY_DEV_URL;
const POPOVER = { width: 300, height: 200 };

let tray: Tray | undefined;
let popover: BrowserWindow | undefined;
let state: BoostState = { level: readLevel(), running: false };
// The level the switch turns back on to.
let lastBoost = isBoost(state.level) ? state.level : DEFAULT_BOOST;
// When the popover was last hidden by losing focus: a click on the tray icon blurs it first, and must not reopen it.
let hiddenAt = 0;
let published = false;

if (!app.requestSingleInstanceLock()) app.quit();

/** Shows a state in the tray and the popover, unless it is the one already shown. */
function publish(next: BoostState): void {
	if (published && next.level === state.level && next.running === state.running) return;
	published = true;
	state = next;
	if (isBoost(next.level)) lastBoost = next.level;
	tray?.setTitle(next.running && isBoost(next.level) ? ` ${next.level}%` : "");
	tray?.setToolTip(next.running ? `Sunny: ${next.level}%` : "Sunny: off");
	if (popover && !popover.isDestroyed()) popover.webContents.send("sunny:state", next);
	console.log(`[sunny] level ${next.level}%, ${next.running ? "running" : "not running"}`);
}

// The latest level wins; the file is written at most 10 times a second while the slider is dragged.
const apply = throttle((level: number) => {
	setLevel(level).then(publish, (e) => console.error("[sunny] could not set the level:", e));
}, 100);

function createPopover(): BrowserWindow {
	const win = new BrowserWindow({
		...POPOVER,
		show: false,
		frame: false,
		resizable: false,
		movable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		skipTaskbar: true,
		alwaysOnTop: true,
		transparent: true,
		hasShadow: true,
		roundedCorners: true,
		vibrancy: "popover",
		visualEffectState: "active",
		backgroundColor: "#00000000",
		webPreferences: {
			preload: path.join(HERE, "preload.cjs"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
			spellcheck: false,
			navigateOnDragDrop: false,
		},
	});
	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	win.on("blur", () => {
		if (!win.webContents.isDevToolsOpened()) {
			hiddenAt = Date.now();
			win.hide();
		}
	});
	win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	win.webContents.on("will-navigate", (e) => e.preventDefault());
	win.webContents.on("will-attach-webview", (e) => e.preventDefault());
	win.webContents.on("console-message", ({ level, message }) => {
		if (level === "error" || level === "warning") console.error(`[sunny page] ${message}`);
	});
	if (DEV_URL) void win.loadURL(DEV_URL);
	else void win.loadFile(path.join(ROOT, "dist", "index.html"));
	return win;
}

/** Puts the popover centered under the tray icon, kept within the screen it is on. */
function placePopover(win: BrowserWindow): void {
	const icon = tray!.getBounds();
	const area = screen.getDisplayMatching(icon).workArea;
	const x = Math.round(icon.x + icon.width / 2 - POPOVER.width / 2);
	const y = Math.round(icon.y + icon.height + 4);
	win.setPosition(Math.min(Math.max(x, area.x + 4), area.x + area.width - POPOVER.width - 4), Math.max(y, area.y));
}

function togglePopover(): void {
	popover ??= createPopover();
	if (popover.isVisible()) return popover.hide();
	if (Date.now() - hiddenAt < 250) return;
	placePopover(popover);
	popover.show();
	popover.focus();
	popover.webContents.send("sunny:state", state);
}

function trayIcon(): Electron.NativeImage {
	// The @2x file beside it is picked up by itself; "Template" makes macOS draw it in the menu bar's color.
	const image = nativeImage.createFromPath(path.join(ROOT, "assets", "trayTemplate.png"));
	image.setTemplateImage(true);
	return image;
}

function quit(): void {
	// The boost is left as it is: it outlives the app on purpose, like when it is started from the shell.
	apply.flush();
	app.quit();
}

ipcMain.handle("sunny:state", () => state);
ipcMain.handle("sunny:set", (_e, level: unknown) => {
	if (typeof level === "number") apply(level);
});
ipcMain.handle("sunny:step", (_e, steps: unknown) => {
	if (typeof steps !== "number" || !Number.isInteger(steps)) return;
	apply(stepLevel(state.running ? state.level : MIN_LEVEL, steps));
});
ipcMain.handle("sunny:toggle", (_e, on: unknown) => apply(on === true ? lastBoost : MIN_LEVEL));
ipcMain.handle("sunny:quit", () => quit());
// Open at login is offered by the packaged app only: in development it would register Electron itself.
ipcMain.handle("sunny:login", () => (app.isPackaged ? app.getLoginItemSettings().openAtLogin : null));
ipcMain.handle("sunny:login-set", (_e, on: unknown) => {
	if (!app.isPackaged) return null;
	app.setLoginItemSettings({ openAtLogin: on === true });
	return app.getLoginItemSettings().openAtLogin;
});

app.whenReady().then(async () => {
	app.dock?.hide();
	tray = new Tray(trayIcon());
	tray.setIgnoreDoubleClickEvents(true);
	// Its place is known once the menu bar has laid it out.
	console.log(`[sunny] boost program ${BOOST_BIN}`);
	setTimeout(() => console.log(`[sunny] tray icon at ${JSON.stringify(tray?.getBounds())}`), 1000);
	tray.on("click", togglePopover);
	tray.on("right-click", () => tray!.popUpContextMenu(Menu.buildFromTemplate([{ label: "Quit Sunny", click: quit }])));
	publish(await readState());
	watchState(publish);
	// Loaded ahead, so that the first click opens it at once.
	popover = createPopover();
});

// A menu-bar app keeps running with its popover closed.
app.on("window-all-closed", () => {});
