import { readFileSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: false,
  external: ["react", "react-dom"],
  banner: {
    js: '"use client";',
  },
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      __ZIG_WORKER_SOURCE__: JSON.stringify(readFileSync("dist/zig.worker.js", "utf8")),
    };
  },
  async onSuccess() {
    await mkdir("dist", { recursive: true });
    await copyFile("src/styles.css", "dist/styles.css");
  },
});
