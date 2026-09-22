"use client";

import { useState } from "react";
import { ZigEditor, type RunStatus } from "zigeditor";
import "zigeditor/styles.css";

const missingArtifacts = {
  moduleUrl: "/wasm/0.16.0/zig.wasm",
  stdUrl: "/wasm/0.16.0/std.tar",
  compilerRtUrl: "/wasm/0.16.0/libcompiler_rt.a",
};

export default function Page() {
  const [status, setStatus] = useState<RunStatus | "pending">("pending");

  return (
    <main style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}>
      <p aria-label="Compiler status">{status}</p>
      <ZigEditor
        value={"const x = 1;\n"}
        onChange={() => {}}
        onStatus={setStatus}
        artifacts={missingArtifacts}
      />
    </main>
  );
}
