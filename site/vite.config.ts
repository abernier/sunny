import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Served from https://abernier.github.io/sunny/, a GitHub Pages project page.
export default defineConfig({
  base: "/sunny/",
  plugins: [tailwindcss()],
});
