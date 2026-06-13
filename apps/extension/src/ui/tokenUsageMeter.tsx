import type { ModelInfo } from "@askai/core";
import type { CSSProperties } from "react";
import { formatCompactNumber } from "../utils/misc";

export function TokenUsageMeter({ draft, model }: { draft: string; model?: ModelInfo }) {
  const estimatedTokens = Math.ceil(draft.trim().length / 4);
  const percentUsed = model?.contextWindow
    ? Math.min(99, Math.round((estimatedTokens / model.contextWindow) * 100))
    : 0;
  const title = model?.contextWindow
    ? `Estimated ${formatCompactNumber(estimatedTokens)} of ${formatCompactNumber(
        model.contextWindow,
      )} input tokens`
    : `Estimated ${formatCompactNumber(estimatedTokens)} input tokens`;

  return (
    <div
      className="token-meter"
      style={{ "--token-percent": `${percentUsed}` } as CSSProperties}
      title={title}
    >
      <span>{percentUsed}</span>
      <span className="sr-only">{title}</span>
    </div>
  );
}
