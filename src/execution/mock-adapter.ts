import { HELLO_ZIG_SOURCE, HELLO_ZIG_STDOUT } from "./hello";
import type { RunRequest, RunResult, RunStatus } from "./types";

export const MOCK_PREVIEW_MESSAGE =
  "The in-browser Zig compiler could not load. This is a preview runner. Your code stays in this browser.";

export type MockRunRequest = RunRequest;

function normalizeWhitespace(code: string) {
  return code.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class MockAdapter {
  readonly id = "mock";
  readonly channel = "default";
  readonly label: string;
  readonly compilerLabel: string;

  constructor(compilerLabel: string) {
    this.compilerLabel = compilerLabel;
    this.label = compilerLabel;
  }

  status(): RunStatus {
    return "unavailable";
  }

  async run(req: RunRequest): Promise<RunResult> {
    const waitMs = 400 + Math.floor(Math.random() * 401);
    await delay(waitMs);

    const normalizedCode = normalizeWhitespace(req.code);
    const expected = req.expectedOutput?.replace(/\r\n/g, "\n");
    const matchSources = req.matchSources ?? [];

    if (expected && matchSources.length > 0) {
      const matchesKnown = matchSources.some(
        (source) => normalizedCode === normalizeWhitespace(source),
      );
      if (matchesKnown) {
        return {
          ok: true,
          stdout: expected.endsWith("\n") ? expected : `${expected}\n`,
          stderr: "",
          exitCode: 0,
          durationMs: waitMs,
          compilerLabel: this.compilerLabel,
          preview: true,
        };
      }
    }

    if (normalizedCode === normalizeWhitespace(HELLO_ZIG_SOURCE)) {
      return {
        ok: true,
        stdout: HELLO_ZIG_STDOUT,
        stderr: "",
        exitCode: 0,
        durationMs: waitMs,
        compilerLabel: this.compilerLabel,
        preview: true,
      };
    }

    return {
      ok: false,
      stdout: "",
      stderr: MOCK_PREVIEW_MESSAGE,
      exitCode: null,
      durationMs: waitMs,
      compilerLabel: this.compilerLabel,
      preview: true,
    };
  }
}
