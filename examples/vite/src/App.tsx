import { useState } from "react";
import { HELLO_ZIG_SOURCE, ZigEditor, type RunResult } from "zigeditor";
import "zigeditor/styles.css";

export function App() {
  const [code, setCode] = useState(HELLO_ZIG_SOURCE);
  const [result, setResult] = useState<RunResult | null>(null);

  return (
    <main style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontFamily: "sans-serif", fontSize: 20 }}>ZigEditor</h1>
      <ZigEditor value={code} onChange={setCode} onRunResult={setResult} />
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
