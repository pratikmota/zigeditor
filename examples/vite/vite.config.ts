import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmPublic = path.resolve(here, "public/wasm/0.16.0");
const wasmBase = "/wasm/0.16.0";
const hasWasm = fs.existsSync(path.join(wasmPublic, "zig.wasm"));

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_ZIG_WASM": JSON.stringify(hasWasm ? wasmBase : ""),
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
  },
});
