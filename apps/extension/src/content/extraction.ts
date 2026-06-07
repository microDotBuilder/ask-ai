import {
  defaultContextTokenCap,
  messageTypes,
  type ContextMode,
  type PageContextMetrics,
  type PageContextResponseMessage,
  type SensitivePageSignal,
} from "@askai/core";

export const EXTRACTION_CHARACTER_CAP = Math.min(defaultContextTokenCap, 120_000);

interface ExtractionResult {
  text: string;
  truncated: boolean;
  metrics: PageContextMetrics;
}

function getDomain(): string {
  return window.location.hostname;
}

function unavailableSensitiveResponse(signal: SensitivePageSignal): PageContextResponseMessage {
  return {
    type: messageTypes.pageContextResponse,
    status: "blocked",
    unavailable: {
      availability: "blocked",
      reason: "sensitive-page",
      message: signal.reason,
    },
  };
}

function getLabelText(input: HTMLInputElement): string {
  const labels = Array.from(input.labels ?? []).map((label) => label.textContent ?? "");
  const ariaLabel = input.getAttribute("aria-label") ?? "";
  const placeholder = input.getAttribute("placeholder") ?? "";
  const name = input.getAttribute("name") ?? "";
  const id = input.id;

  return [labels.join(" "), ariaLabel, placeholder, name, id].join(" ").toLowerCase();
}

export function detectSensitivePage(): SensitivePageSignal | null {
  if (document.querySelector('input[type="password"]')) {
    return {
      kind: "password-field",
      reason: "This page contains password fields, so Ask AI will not read it.",
    };
  }

  const paymentPattern = /\b(card|credit|debit|cc-number|cvc|cvv|expiration|expiry|billing)\b/i;

  for (const input of Array.from(document.querySelectorAll("input"))) {
    const autocomplete = input.getAttribute("autocomplete") ?? "";
    const text = `${autocomplete} ${getLabelText(input)}`;

    if (/\bcc-(name|number|exp|csc|type)\b/i.test(autocomplete) || paymentPattern.test(text)) {
      return {
        kind: "payment-field",
        reason:
          "This page appears to contain payment or billing fields, so Ask AI will not read it.",
      };
    }
  }

  const bodyText = document.body?.innerText ?? document.body?.textContent ?? "";
  const pageText = [document.title, bodyText.slice(0, 5000)].join(" ").toLowerCase();
  const authAccountSignals = [
    /\bsign in\b/,
    /\blog in\b/,
    /\btwo[- ]factor\b/,
    /\baccount settings\b/,
    /\bbilling address\b/,
    /\bpayment method\b/,
    /\bsecurity settings\b/,
  ];
  const signalCount = authAccountSignals.filter((pattern) => pattern.test(pageText)).length;

  if (signalCount >= 2) {
    return {
      kind: "auth-account-indicator",
      reason: "This page looks like an account, auth, or billing page, so Ask AI will not read it.",
    };
  }

  return null;
}

function visibleText(element: Element): string {
  const style = window.getComputedStyle(element);

  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return "";
  }

  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function addChunk(chunks: string[], value: string): void {
  const normalized = value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized) {
    chunks.push(normalized);
  }
}

export function extractStructuredText(): ExtractionResult {
  const chunks: string[] = [];
  const metrics = {
    characterCount: 0,
    extractedCharacterCount: 0,
    truncatedCharacterCount: 0,
    headingCount: 0,
    paragraphCount: 0,
    listCount: 0,
    codeBlockCount: 0,
    tableCount: 0,
  };

  const root = document.querySelector("main") ?? document.body;
  const nodes = Array.from(
    root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,pre,code,table,blockquote"),
  );

  for (const node of nodes) {
    const tagName = node.tagName.toLowerCase();

    if (tagName.match(/^h[1-6]$/)) {
      const level = Number(tagName.slice(1));
      const text = visibleText(node);
      metrics.headingCount += text ? 1 : 0;
      addChunk(chunks, `${"#".repeat(level)} ${text}`);
      continue;
    }

    if (tagName === "p" || tagName === "blockquote") {
      const text = visibleText(node);
      metrics.paragraphCount += text ? 1 : 0;
      addChunk(chunks, text);
      continue;
    }

    if (tagName === "li") {
      const text = visibleText(node);
      metrics.listCount += text ? 1 : 0;
      addChunk(chunks, `- ${text}`);
      continue;
    }

    if (tagName === "pre" || tagName === "code") {
      const text = visibleText(node);
      metrics.codeBlockCount += text ? 1 : 0;
      addChunk(chunks, ["```", text, "```"].join("\n"));
      continue;
    }

    if (tagName === "table") {
      const rows = Array.from(node.querySelectorAll("tr"))
        .map((row) =>
          Array.from(row.querySelectorAll("th,td"))
            .map((cell) => visibleText(cell))
            .filter(Boolean)
            .join(" | "),
        )
        .filter(Boolean);

      metrics.tableCount += rows.length ? 1 : 0;
      addChunk(chunks, rows.join("\n"));
    }
  }

  if (chunks.length === 0) {
    addChunk(chunks, document.body?.innerText ?? "");
  }

  const extractedText = chunks.join("\n\n");
  const truncated = extractedText.length > EXTRACTION_CHARACTER_CAP;
  const text = truncated
    ? `${extractedText.slice(0, EXTRACTION_CHARACTER_CAP)}\n\n[Context truncated]`
    : extractedText;

  metrics.extractedCharacterCount = extractedText.length;
  metrics.truncatedCharacterCount = truncated ? extractedText.length - EXTRACTION_CHARACTER_CAP : 0;
  metrics.characterCount = text.length;

  return {
    text,
    truncated,
    metrics,
  };
}

export function extractPageContext(mode: ContextMode): PageContextResponseMessage {
  const sensitiveSignal = detectSensitivePage();

  if (sensitiveSignal) {
    return unavailableSensitiveResponse(sensitiveSignal);
  }

  const extraction = extractStructuredText();

  return {
    type: messageTypes.pageContextResponse,
    status: "available",
    context: {
      title: document.title,
      url: window.location.href,
      domain: getDomain(),
      mode,
      text: extraction.text,
      truncated: extraction.truncated,
      metrics: extraction.metrics,
    },
  };
}
