import { copyFile, mkdir, rename } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "zig.worker": "src/execution/zig.worker.ts" },
  format: ["iife"],
  platform: "browser",
  dts: false,
  clean: false,
  splitting: false,
  outDir: "dist",
  async onSuccess() {
    await mkdir("dist", { recursive: true });
    await rename("dist/zig.worker.global.js", "dist/zig.worker.js");
  },
});
