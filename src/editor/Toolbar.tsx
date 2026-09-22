import type { ReactNode } from "react";

import type { RunStatus, ZigEditorAction, ZigEditorLabels, ZigEditorVersion } from "../execution/types";

export function Toolbar({
  labels,
  preloadStatus,
  showRun,
  showFormat,
  showReset,
  showCopy,
  compact,
  runLabel,
  formatLabel,
  copyLabel,
  copied,
  spinning,
  runDisabled,
  formatDisabled,
  versionLabel,
  versions,
  version,
  onVersionChange,
  newHref,
  reportHref,
  actions,
  onRun,
  onFormat,
  onReset,
  onCopy,
}: {
  labels: ZigEditorLabels;
  preloadStatus: RunStatus;
  showRun: boolean;
  showFormat: boolean;
  showReset: boolean;
  showCopy: boolean;
  compact: boolean;
  runLabel: string;
  formatLabel: string;
  copyLabel: string;
  copied: boolean;
  spinning: boolean;
  runDisabled: boolean;
  formatDisabled: boolean;
  versionLabel?: string;
  versions?: ZigEditorVersion[];
  version?: string;
  onVersionChange?: (id: string) => void;
  newHref?: string;
  reportHref?: string;
  actions?: ZigEditorAction[];
  onRun: () => void;
  onFormat: () => void;
  onReset: () => void;
  onCopy: () => void;
}) {
  const hint =
    preloadStatus === "loading"
      ? labels.loading
      : preloadStatus === "unavailable"
        ? labels.unavailable
        : labels.hint;

  return (
    <div className="zig-editor-toolbar">
      <div className="zig-editor-toolbar-row">
        <VersionControl
          versionLabel={versionLabel}
          versions={versions}
          version={version}
          onVersionChange={onVersionChange}
          versionAriaLabel={labels.version}
        />
        {showRun ? (
          <button type="button" className="zig-editor-run" onClick={onRun} disabled={runDisabled}>
            {spinning ? <Spinner /> : <PlayIcon />}
            {runLabel}
          </button>
        ) : null}
        {showReset ? (
          <button
            type="button"
            className={compact ? "zig-editor-outline zig-editor-icon" : "zig-editor-outline"}
            onClick={onReset}
            aria-label={compact ? labels.reset : undefined}
            data-tooltip={compact ? labels.reset : undefined}
          >
            <ResetIcon />
            {compact ? null : labels.reset}
          </button>
        ) : null}
        {showCopy ? (
          <button
            type="button"
            className={compact ? "zig-editor-outline zig-editor-icon" : "zig-editor-outline"}
            onClick={onCopy}
            aria-label={compact ? (copied ? labels.copied : labels.copy) : undefined}
            data-tooltip={compact ? (copied ? labels.copied : labels.copy) : undefined}
          >
            <CopyIcon />
            {compact ? null : copyLabel}
          </button>
        ) : null}
        {showFormat ? (
          <button
            type="button"
            className={compact ? "zig-editor-outline zig-editor-icon" : "zig-editor-outline"}
            onClick={onFormat}
            disabled={formatDisabled}
            aria-label={compact ? formatLabel : undefined}
            data-tooltip={compact ? formatLabel : undefined}
          >
            <FormatIcon />
            {compact ? null : formatLabel}
          </button>
        ) : null}
        {newHref ? (
          <a
            className={compact ? "zig-editor-outline zig-editor-icon" : "zig-editor-outline"}
            href={newHref}
            aria-label={compact ? labels.new : undefined}
            data-tooltip={compact ? labels.new : undefined}
          >
            <PlusIcon />
            {compact ? null : labels.new}
          </a>
        ) : null}
        {reportHref ? (
          <a
            className={compact ? "zig-editor-outline zig-editor-icon" : "zig-editor-outline"}
            href={reportHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={compact ? labels.report : undefined}
            data-tooltip={compact ? labels.report : undefined}
          >
            <FlagIcon />
            {compact ? null : labels.report}
          </a>
        ) : null}
        {actions?.map((action, index) => (
          <ActionControl key={`${action.label}-${index}`} action={action} compact={compact} />
        ))}
      </div>
      <p className="zig-editor-toolbar-hint">{hint}</p>
    </div>
  );
}

function ActionIcon({ icon }: { icon?: ZigEditorAction["icon"] }) {
  if (icon === "flag") return <FlagIcon />;
  if (icon === "share") return <ShareIcon />;
  return <PlusIcon />;
}

function ActionControl({ action, compact }: { action: ZigEditorAction; compact: boolean }) {
  const icon = <ActionIcon icon={action.icon} />;
  const className = compact ? "zig-editor-outline zig-editor-icon" : "zig-editor-outline";
  if (action.href) {
    return (
      <a
        className={className}
        href={action.href}
        target={action.external ? "_blank" : undefined}
        rel={action.external ? "noopener noreferrer" : undefined}
        aria-label={compact ? action.label : undefined}
        data-tooltip={compact ? action.label : undefined}
      >
        {icon}
        {compact ? null : action.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={action.onClick}
      aria-label={compact ? action.label : undefined}
      data-tooltip={compact ? action.label : undefined}
    >
      {icon}
      {compact ? null : action.label}
    </button>
  );
}

function VersionControl({
  versionLabel,
  versions,
  version,
  onVersionChange,
  versionAriaLabel,
}: {
  versionLabel?: string;
  versions?: ZigEditorVersion[];
  version?: string;
  onVersionChange?: (id: string) => void;
  versionAriaLabel: string;
}) {
  if (versions && versions.length > 0) {
    return (
      <select
        className="zig-editor-version"
        aria-label={versionAriaLabel}
        value={version ?? versions[0]?.id}
        onChange={(event) => onVersionChange?.(event.target.value)}
      >
        {versions.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    );
  }

  if (!versionLabel) return null;
  return <span className="zig-editor-version">{versionLabel}</span>;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="zig-editor-svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      {children}
    </svg>
  );
}

function PlayIcon() {
  return (
    <Icon>
      <path d="M5 3.5v9l8-4.5-8-4.5z" fill="currentColor" />
    </Icon>
  );
}

function Spinner() {
  return (
    <Icon>
      <circle className="zig-editor-spin" cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="20 12" />
    </Icon>
  );
}

function ResetIcon() {
  return (
    <Icon>
      <path d="M3 8a5 5 0 1 0 1.2-3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 2.5V6h3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </Icon>
  );
}

function CopyIcon() {
  return (
    <Icon>
      <rect x="5.5" y="5.5" width="7" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 10.5H3.5A1.5 1.5 0 0 1 2 9V3.5A1.5 1.5 0 0 1 3.5 2H9a1.5 1.5 0 0 1 1.5 1.5V4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </Icon>
  );
}

function FormatIcon() {
  return (
    <Icon>
      <path d="M2 4h12M2 8h8M2 12h9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Icon>
  );
}

function PlusIcon() {
  return (
    <Icon>
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </Icon>
  );
}

function FlagIcon() {
  return (
    <Icon>
      <path d="M4 2.5v11M4 3.5h7l-1.5 2.5L11 8.5H4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </Icon>
  );
}

function ShareIcon() {
  return (
    <Icon>
      <circle cx="4" cy="8" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="4.2" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="11.8" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7.2 10 4.8M5.5 8.8 10 11.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </Icon>
  );
}
