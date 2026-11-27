import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Served from https://abernier.github.io/sunny/, a GitHub Pages project page.
export default defineConfig({
  base: "/sunny/",
  plugins: [tailwindcss()],
  build: {
    rolldownOptions: {
      // One input per page: the landing, and the privacy policy at /sunny/privacy/ (linked from the App Store listing).
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        privacy: fileURLToPath(new URL("privacy/index.html", import.meta.url)),
      },
    },
  },
});
