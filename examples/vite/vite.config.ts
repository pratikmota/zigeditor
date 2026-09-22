import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmDist = path.resolve(here, "../../../ziglab/tools/zig-wasm/dist/0.16.0");
const wasmBase = "/wasm/0.16.0";
const hasWasm = fs.existsSync(path.join(wasmDist, "zig.wasm"));

function zigWasmDist(): Plugin {
  const prefix = `${wasmBase}/`;
  return {
    name: "zig-wasm-dist",
    configureServer(server) {
      if (!hasWasm) return;
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(prefix)) {
          next();
          return;
        }
        const rel = decodeURIComponent(url.slice(prefix.length));
        const abs = path.resolve(wasmDist, rel);
        if (!abs.startsWith(wasmDist + path.sep)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("content-type", "application/octet-stream");
        fs.createReadStream(abs).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), zigWasmDist()],
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
