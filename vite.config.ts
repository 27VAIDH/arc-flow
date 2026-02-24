/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";

function copyManifest() {
  return {
    name: "copy-manifest",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }
      copyFileSync(
        resolve(__dirname, "public/manifest.json"),
        resolve(distDir, "manifest.json")
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyManifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
        "service-worker": resolve(
          __dirname,
          "src/background/service-worker.ts"
        ),
        "content-capture": resolve(
          __dirname,
          "src/content/capture.ts"
        ),
        "content-research": resolve(
          __dirname,
          "src/content/research.ts"
        ),
        "content-annotate": resolve(
          __dirname,
          "src/content/annotate.ts"
        ),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
