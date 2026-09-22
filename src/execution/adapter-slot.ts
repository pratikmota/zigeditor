import type { ExecutionAdapter } from "./types";

type Slot = {
  key: string;
  adapter: ExecutionAdapter;
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const slots = new Map<string, Slot>();

function clearTimer(slot: Slot) {
  if (!slot.timer) return;
  clearTimeout(slot.timer);
  slot.timer = null;
}

function slotFor(adapter: ExecutionAdapter): Slot | undefined {
  for (const slot of slots.values()) {
    if (slot.adapter === adapter) return slot;
  }
  return undefined;
}

/** One adapter per artifact key. A second key does not dispose the first. */
export function acquireEditorAdapter(
  key: string,
  create: () => ExecutionAdapter,
): ExecutionAdapter {
  const existing = slots.get(key);
  if (existing) {
    clearTimer(existing);
    existing.refs += 1;
    return existing.adapter;
  }
  const created = create();
  slots.set(key, { key, adapter: created, refs: 1, timer: null });
  return created;
}

export function releaseEditorAdapter(adapter: ExecutionAdapter): void {
  const slot = slotFor(adapter);
  if (!slot) return;
  slot.refs -= 1;
  if (slot.refs > 0) return;
  clearTimer(slot);
  slot.timer = setTimeout(() => {
    slot.timer = null;
    const current = slots.get(slot.key);
    if (current !== slot || slot.refs > 0) return;
    slot.adapter.dispose?.();
    if (slots.get(slot.key) === slot) slots.delete(slot.key);
  }, 0);
}
