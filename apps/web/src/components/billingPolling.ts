import type { BillingSummary } from '@benchmark/domain';

/** Keep the deadline independent of requests so a stalled request cannot leave confirmation spinning. */
export function pollBilling(
  load: (signal: AbortSignal) => Promise<BillingSummary>,
  onSummary: (summary: BillingSummary) => boolean,
  onError: (cause: unknown) => void,
  onTimeout: () => void,
): () => void {
  const controller = new AbortController();
  let live = true;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    live = false;
    clearTimeout(retry);
    clearTimeout(deadline);
    controller.abort();
  };
  const deadline = setTimeout(() => { cancel(); onTimeout(); }, 120_000);
  const poll = async () => {
    try {
      const summary = await load(controller.signal);
      if (!live) return;
      if (onSummary(summary)) { cancel(); return; }
    } catch (cause) {
      if (!live) return;
      onError(cause);
    }
    if (live) retry = setTimeout(() => { void poll(); }, 4000);
  };
  void poll();
  return cancel;
}
