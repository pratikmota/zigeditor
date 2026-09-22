import { useState } from "react";
import {
  HELLO_ZIG_SOURCE,
  ZigEditor,
  type RunResult,
  type ZigEditorTheme,
  type ZigWasmArtifacts,
} from "zigeditor";
import "zigeditor/styles.css";

const wasmBase = import.meta.env.VITE_ZIG_WASM;
const artifacts: ZigWasmArtifacts | undefined = wasmBase
  ? {
      moduleUrl: `${wasmBase}/zig.wasm`,
      stdUrl: `${wasmBase}/std.tar`,
      compilerRtUrl: `${wasmBase}/libcompiler_rt.a`,
    }
  : undefined;

const versions = [
  { id: "stable", label: "Zig 0.16.0" },
  { id: "master", label: "Zig master" },
];

export function App() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const themeParam = params.get("theme");
  const [theme, setTheme] = useState<ZigEditorTheme>(
    themeParam === "light" || themeParam === "dark" || themeParam === "system" ? themeParam : "system",
  );
  const liveArtifacts = params.has("mock") ? undefined : artifacts;
  const [version, setVersion] = useState("stable");
  const [playKey, setPlayKey] = useState(0);
  const [playCode, setPlayCode] = useState(HELLO_ZIG_SOURCE);
  const [playResult, setPlayResult] = useState<RunResult | null>(null);
  const [learnKey, setLearnKey] = useState(0);
  const [learnCode, setLearnCode] = useState(HELLO_ZIG_SOURCE);
  const [learnResult, setLearnResult] = useState<RunResult | null>(null);

  function startNewPlayground() {
    setPlayCode(HELLO_ZIG_SOURCE);
    setPlayResult(null);
    setPlayKey((key) => key + 1);
  }

  function startNewLesson() {
    setLearnCode(HELLO_ZIG_SOURCE);
    setLearnResult(null);
    setLearnKey((key) => key + 1);
  }

  return (
    <main style={{ maxWidth: 880, margin: "24px auto", padding: "0 16px" }}>
      <style>{`
        .theme-toggle { position: relative; }
        .theme-toggle::after {
          content: attr(data-tooltip);
          position: absolute;
          z-index: 5;
          left: 50%;
          top: calc(100% + 6px);
          transform: translateX(-50%);
          padding: 4px 8px;
          border-radius: 6px;
          background: #1a1814;
          color: #fff8e8;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 12px;
          line-height: 1.2;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          visibility: hidden;
        }
        .theme-toggle:hover::after,
        .theme-toggle:focus-visible::after {
          opacity: 1;
          visibility: visible;
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontFamily: "sans-serif", fontSize: 20, margin: 0 }}>ZigEditor</h1>
        <ThemeButton theme={theme} onChange={setTheme} />
      </div>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontFamily: "sans-serif", fontSize: 16 }}>Playground</h2>
        <div style={{ height: 520 }}>
          <ZigEditor
            key={playKey}
            value={playCode}
            onChange={setPlayCode}
            onRunResult={setPlayResult}
            theme={theme}
            artifacts={liveArtifacts}
            versions={versions}
            version={version}
            onVersionChange={setVersion}
            reportHref="https://example.com/report"
            actions={[{ label: "New", onClick: startNewPlayground }]}
          />
        </div>
        <ResultPreview label="Playground run result" result={playResult} />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontFamily: "sans-serif", fontSize: 16 }}>Learn</h2>
        <div style={{ height: 520 }}>
          <ZigEditor
            key={learnKey}
            value={learnCode}
            onChange={setLearnCode}
            onRunResult={setLearnResult}
            theme={theme}
            artifacts={liveArtifacts}
            compact
            versions={[{ id: "0.16.0", label: "Zig 0.16.0" }]}
            version="0.16.0"
            reportHref="https://example.com/report"
            actions={[{ label: "New", onClick: startNewLesson }]}
          />
        </div>
        <ResultPreview label="Learn run result" result={learnResult} />
      </section>
    </main>
  );
}

const themeOrder: ZigEditorTheme[] = ["system", "light", "dark"];

const themeLabel: Record<ZigEditorTheme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function ThemeButton({ theme, onChange }: { theme: ZigEditorTheme; onChange: (theme: ZigEditorTheme) => void }) {
  const next = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length] ?? "system";
  const label = `Theme: ${themeLabel[theme]}`;

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      data-tooltip={label}
      onClick={() => onChange(next)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        border: "1px solid #dddcd6",
        borderRadius: 6,
        background: "transparent",
        color: "#1a1814",
        cursor: "pointer",
      }}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}

function ThemeIcon({ theme }: { theme: ZigEditorTheme }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M9.2 2.2a5.2 5.2 0 1 0 4.6 7.6A4.4 4.4 0 0 1 9.2 2.2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="8.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 13.5h4M8 11v2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ResultPreview({ label, result }: { label: string; result: RunResult | null }) {
  return (
    <pre
      aria-label={label}
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
  );
}
