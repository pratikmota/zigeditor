import { copyFile, mkdir } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["react", "react-dom"],
  banner: {
    js: '"use client";',
  },
  async onSuccess() {
    await mkdir("dist", { recursive: true });
    await copyFile("src/styles.css", "dist/styles.css");
  },
});
