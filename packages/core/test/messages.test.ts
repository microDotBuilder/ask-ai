import { describe, expect, it } from "vitest";
import {
  messageTypes,
  parseChromeMessage,
  safeParseChromeMessage,
  type PageContextResponseMessage,
} from "../src";

describe("Chrome message schemas", () => {
  it("parses page context responses with context metrics", () => {
    const message: PageContextResponseMessage = {
      type: messageTypes.pageContextResponse,
      tabId: 42,
      status: "available",
      context: {
        title: "Runtime contracts",
        url: "https://example.com/runtime",
        domain: "example.com",
        mode: "full-page",
        text: "Page body",
        truncated: false,
        metrics: {
          characterCount: 9,
          extractedCharacterCount: 9,
          truncatedCharacterCount: 0,
          headingCount: 1,
          paragraphCount: 1,
          listCount: 0,
          codeBlockCount: 0,
          tableCount: 0,
        },
      },
    };

    expect(parseChromeMessage(message)).toEqual(message);
  });

  it("parses quick action messages with optional focus and full-page mode", () => {
    const parsed = parseChromeMessage({
      type: messageTypes.quickActionRequest,
      actionId: "explain",
      tabId: 7,
      focus: "selected text",
      mode: "full-page",
    });

    expect(parsed).toMatchObject({
      type: messageTypes.quickActionRequest,
      actionId: "explain",
      focus: "selected text",
      mode: "full-page",
    });
  });

  it("rejects invalid message payloads and impossible page context states", () => {
    expect(safeParseChromeMessage({ type: "PAGE_CONTEXT_REQUEST", mode: "private" }).ok).toBe(
      false,
    );
    expect(
      safeParseChromeMessage({
        type: messageTypes.pageContextResponse,
        status: "available",
      }).ok,
    ).toBe(false);
    expect(
      safeParseChromeMessage({
        type: messageTypes.pageContextResponse,
        status: "blocked",
        unavailable: {
          availability: "failed",
          reason: "extraction-failed",
          message: "Wrong status.",
        },
      }).ok,
    ).toBe(false);
    expect(
      safeParseChromeMessage({
        type: messageTypes.pageContextResponse,
        status: "unsupported",
        unavailable: {
          availability: "unsupported",
          reason: "sensitive-page",
          message: "Wrong reason.",
        },
      }).ok,
    ).toBe(false);
    expect(() => parseChromeMessage({ type: messageTypes.selectionChanged, text: 123 })).toThrow();
  });
});
