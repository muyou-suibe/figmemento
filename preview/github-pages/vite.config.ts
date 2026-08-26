import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const previewRoot = resolve(repositoryRoot, "preview/github-pages");
const configuredBasePath = process.env.PREVIEW_BASE_PATH ?? "/";

export default defineConfig({
  root: previewRoot,
  base: configuredBasePath,
  plugins: [react()],
  build: {
    outDir: resolve(repositoryRoot, "dist/github-pages-preview"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(previewRoot, "index.html"),
    },
  },
});
