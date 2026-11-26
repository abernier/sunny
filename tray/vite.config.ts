import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	// The built page is loaded from a file:// URL by the main process.
	base: "./",
	plugins: [react(), tailwindcss()],
	server: { port: 5199, strictPort: false },
	build: { outDir: "dist", emptyOutDir: true, target: "chrome140" },
});
