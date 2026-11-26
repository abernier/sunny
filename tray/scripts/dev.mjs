// Development: the page from Vite's server (it reloads as you edit), the main process built once.
//   pnpm dev
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "vite";
import { buildBoost } from "./boost.mjs";
import { buildMain, ensureIcon } from "./build.mjs";

const root = path.resolve(import.meta.dirname, "..");

ensureIcon();
buildBoost();
await buildMain();
const server = await createServer({ root });
await server.listen();
const url = server.resolvedUrls.local[0];
const electron = createRequire(import.meta.url)("electron");
const child = spawn(electron, [root, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, SUNNY_DEV_URL: url } });
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("close", async (code) => {
	await server.close();
	process.exit(code ?? 0);
});
