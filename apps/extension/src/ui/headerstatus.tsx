import type { ContextState } from "../types/types";

export function HeaderStatus({
  state,
  isStreaming,
}: {
  state: ContextState;
  isStreaming: boolean;
}) {
  if (isStreaming) {
    return <p className="status-copy">Writing response...</p>;
  }

  if (state.status === "available") {
    return <p className="status-copy">Ready on {state.context.domain || "this tab"}</p>;
  }

  if (state.status === "loading") {
    return <p className="status-copy">Reading the active tab...</p>;
  }

  return <p className="status-copy status-copy-warning">{state.response.unavailable.message}</p>;
}
