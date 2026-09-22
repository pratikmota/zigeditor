import { useState } from "react";
import { HELLO_ZIG_SOURCE, ZigEditor, type RunResult, type ZigWasmArtifacts } from "zigeditor";
import "zigeditor/styles.css";

const wasmBase = import.meta.env.VITE_ZIG_WASM;
const artifacts: ZigWasmArtifacts | undefined = wasmBase
  ? {
      moduleUrl: `${wasmBase}/zig.wasm`,
      stdUrl: `${wasmBase}/std.tar`,
      compilerRtUrl: `${wasmBase}/libcompiler_rt.a`,
    }
  : undefined;

export function App() {
  const [code, setCode] = useState(HELLO_ZIG_SOURCE);
  const [result, setResult] = useState<RunResult | null>(null);
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const forceMock = params.has("mock");
  const liveArtifacts = forceMock ? undefined : artifacts;
  const runLabel = params.get("run");

  return (
    <main style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontFamily: "sans-serif", fontSize: 20 }}>ZigEditor</h1>
      <div style={{ height: "70vh" }}>
        <ZigEditor
          value={code}
          onChange={setCode}
          onRunResult={setResult}
          artifacts={liveArtifacts}
          showReset={!params.has("noreset")}
          labels={runLabel ? { run: runLabel } : undefined}
        />
      </div>
      <pre
        aria-label="Run result"
        style={{
          marginTop: 16,
          padding: 12,
          overflow: "auto",
          background: "#f6f5f2",
          border: "1px solid #dddcd6",
          borderRadius: 8,
          fontFamily: "ui-monospace, monospace",
          fontSize: 13,
        }}
      >
        {result ? JSON.stringify(result, null, 2) : "Run to see the result."}
      </pre>
    </main>
  );
}
