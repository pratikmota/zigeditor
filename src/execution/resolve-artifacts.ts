import type { ZigWasmArtifacts } from "./types";

function artifactBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/** Prop URLs win. A non-empty base becomes zig.wasm, std.tar.gz, and compiler_rt.a. */
export function resolveArtifacts(
  artifacts: ZigWasmArtifacts | undefined,
  baseUrl: string,
): ZigWasmArtifacts | null {
  if (artifacts) {
    return artifacts;
  }
  const base = artifactBase(baseUrl);
  if (!base) {
    return null;
  }
  return {
    moduleUrl: `${base}/zig.wasm`,
    stdUrl: `${base}/std.tar.gz`,
    compilerRtUrl: `${base}/compiler_rt.a`,
  };
}
