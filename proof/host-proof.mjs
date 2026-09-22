#!/usr/bin/env node
/**
 * In-process proof for ZigWasiHost.
 *
 *   pnpm proof
 *   pnpm proof -- --dist /path/to/dist/0.16.0
 *
 * Default dist is the sibling ZigLab toolchain checkout.
 * Missing zig.wasm prints "artifacts missing" and exits 0.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { HELLO_ZIG_SOURCE } from "../src/execution/hello.ts";
import { ZigWasiHost } from "../src/execution/wasi-host.ts";
import { WASM_SOURCE_MAX_BYTES } from "../src/execution/wasm-limits.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const defaultDist = path.resolve(repoRoot, "../ziglab/tools/zig-wasm/dist/0.16.0");

function distArg() {
  const flag = process.argv.indexOf("--dist");
  if (flag !== -1 && process.argv[flag + 1]) {
    return path.resolve(process.argv[flag + 1]);
  }
  return defaultDist;
}

function requireFile(abs, hint) {
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing ${abs}. ${hint}`);
  }
  return abs;
}

function ensureStdTar(distDir) {
  const tarPath = path.join(distDir, "std.tar");
  const libDir = requireFile(path.join(distDir, "lib"), "Toolchain lib/ is missing.");
  const tarFresh =
    fs.existsSync(tarPath) && fs.statSync(tarPath).mtimeMs >= fs.statSync(libDir).mtimeMs;
  if (tarFresh) return tarPath;
  console.error(`creating ${tarPath} from lib/…`);
  const packed = spawnSync("tar", ["-C", libDir, "-cf", tarPath, "."], { stdio: "inherit" });
  if (packed.status !== 0) throw new Error("tar of lib/ failed");
  return tarPath;
}

function serveDist(distDir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const abs = path.resolve(distDir, rel);
    if (!abs.startsWith(distDir + path.sep) && abs !== distDir) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream" });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function greetingIn(result) {
  return `${result.stdout}\n${result.stderr}`.includes("Hello, ZigEditor");
}

async function main() {
  const distDir = distArg();
  const wasmPath = path.join(distDir, "zig.wasm");
  if (!fs.existsSync(wasmPath)) {
    console.error("artifacts missing");
    return;
  }

  const crt = ["libcompiler_rt.a", "compiler_rt.a"]
    .map((name) => path.join(distDir, name))
    .find((file) => fs.existsSync(file));
  ensureStdTar(distDir);

  const server = await serveDist(distDir);
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("loopback server failed");
  const base = `http://127.0.0.1:${addr.port}`;
  const artifacts = {
    moduleUrl: `${base}/zig.wasm`,
    stdUrl: `${base}/std.tar`,
    compilerRtUrl: crt ? `${base}/${path.basename(crt)}` : undefined,
  };

  const host = new ZigWasiHost({ mode: "in-process" });
  const compileTimeoutMs = 60_000;
  const runTimeoutMs = 10_000;

  try {
    console.error("1/4 hello…");
    const helloResult = await host.run({
      code: HELLO_ZIG_SOURCE,
      artifacts,
      compileTimeoutMs,
      runTimeoutMs,
    });
    if (!helloResult.ok || !greetingIn(helloResult)) {
      console.error(helloResult);
      throw new Error("hello did not print Hello, ZigEditor");
    }
    console.error(`   ok  exit=${helloResult.exitCode} ${helloResult.durationMs}ms`);

    console.error("2/4 syntax error…");
    const broken = await host.run({
      code: "pub fn main() void {\n",
      artifacts,
      compileTimeoutMs,
      runTimeoutMs,
    });
    if (broken.ok || !broken.stderr.trim()) {
      console.error(broken);
      throw new Error("syntax error should return ok: false with stderr");
    }
    console.error(`   ok  compile failed as expected (${broken.stderr.split("\n")[0]})`);

    console.error("3/4 oversized source…");
    const oversized = await host.run({
      code: "a".repeat(WASM_SOURCE_MAX_BYTES + 1),
      artifacts,
      compileTimeoutMs,
      runTimeoutMs,
    });
    if (oversized.ok || oversized.errorKind !== "source_too_large") {
      console.error(oversized);
      throw new Error("oversized source should be rejected without compiling");
    }
    console.error("   ok  rejected before instantiate");

    console.error("4/4 zig fmt…");
    const formatted = await host.format({
      code: "const x=1;",
      artifacts,
      compileTimeoutMs,
    });
    if (!formatted.ok || !formatted.code.includes("x = 1")) {
      console.error(formatted);
      throw new Error("fmt should rewrite const x=1; with spaces around =");
    }
    console.error(`   ok  ${JSON.stringify(formatted.code)} ${formatted.durationMs}ms`);
  } finally {
    host.dispose();
    await new Promise((resolve) => server.close(resolve));
  }

  console.error("host-proof passed");
}

await main();
