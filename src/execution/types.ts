export type ZigEditorTheme = "light" | "dark" | "system";

export type ZigWasmArtifacts = {
  moduleUrl: string;
  stdUrl: string;
  /** Guest cwd exposes this as libcompiler_rt.a when set. */
  compilerRtUrl?: string;
};

export type RunRequest = {
  code: string;
  channel: string;
  timeoutMs?: number;
  matchSources?: string[];
  expectedOutput?: string;
};

export type RunStatus =
  | "idle"
  | "loading"
  | "running"
  | "ok"
  | "error"
  | "unavailable";

export type RunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  compilerLabel: string;
  /** True when the mock preview runner handled the request. */
  preview?: boolean;
};

export type FormatResult = {
  ok: boolean;
  code: string;
  stderr: string;
  durationMs: number;
};

export type ZigEditorLabels = {
  run: string;
  running: string;
  format: string;
  formatting: string;
  reset: string;
  copy: string;
  copied: string;
  copyFailed: string;
  formatFailed: string;
  clear: string;
  stdout: string;
  stderr: string;
  preview: string;
  loading: string;
  unavailable: string;
};

export interface ExecutionAdapter {
  id: string;
  channel: string;
  label: string;
  status: () => RunStatus | Promise<RunStatus>;
  run: (req: RunRequest) => Promise<RunResult>;
  format?: (code: string) => Promise<FormatResult>;
  dispose?: () => void | Promise<void>;
}

export type ZigEditorProps = {
  value: string;
  onChange: (code: string) => void;
  /** Initial buffer used by Reset. Defaults to the first `value`. */
  initialValue?: string;
  theme?: ZigEditorTheme;
  className?: string;
  readOnly?: boolean;
  /** Override CDN or same-origin files. Omit to use DEFAULT_ARTIFACT_BASE_URL. */
  artifacts?: ZigWasmArtifacts;
  compileTimeoutMs?: number;
  runTimeoutMs?: number;
  loadTimeoutMs?: number;
  /** When set, a successful compile is ok only if stdout or stderr matches. */
  expectedOutput?: string;
  /** Mock runner only: treat these sources as the known-good lesson answer. */
  matchSources?: string[];
  /** Shown on run results. Defaults to "Zig". */
  compilerLabel?: string;
  labels?: Partial<ZigEditorLabels>;
  onRunResult?: (result: RunResult) => void;
  onStatus?: (status: RunStatus) => void;
};
