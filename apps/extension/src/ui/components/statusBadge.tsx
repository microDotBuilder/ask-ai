import { StatusPill } from "@askai/ui";
import type { ContextState } from "../../types/types";

export function StatusBadge({ state }: { state: ContextState }) {
  const label = {
    available: "Context ready",
    blocked: "Context blocked",
    failed: "Context unavailable",
    loading: "Loading context",
    unsupported: "Unsupported page",
  }[state.status];

  return (
    <StatusPill className="status-badge" state={state.status}>
      {label}
    </StatusPill>
  );
}
