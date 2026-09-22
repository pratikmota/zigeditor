export function Toolbar({
  runLabel,
  formatLabel,
  resetLabel,
  copyLabel,
  showFormat,
  showReset,
  runDisabled,
  formatDisabled,
  resetDisabled,
  onRun,
  onFormat,
  onReset,
  onCopy,
}: {
  runLabel: string;
  formatLabel: string;
  resetLabel: string;
  copyLabel: string;
  showFormat: boolean;
  showReset: boolean;
  runDisabled: boolean;
  formatDisabled: boolean;
  resetDisabled: boolean;
  onRun: () => void;
  onFormat: () => void;
  onReset: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="zig-editor-toolbar">
      <button type="button" onClick={onRun} disabled={runDisabled}>
        {runLabel}
      </button>
      {showFormat ? (
        <button type="button" onClick={onFormat} disabled={formatDisabled}>
          {formatLabel}
        </button>
      ) : null}
      {showReset ? (
        <button type="button" onClick={onReset} disabled={resetDisabled}>
          {resetLabel}
        </button>
      ) : null}
      <button type="button" onClick={onCopy}>
        {copyLabel}
      </button>
    </div>
  );
}
