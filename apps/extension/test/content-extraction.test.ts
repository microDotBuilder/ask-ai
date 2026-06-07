import { afterEach, describe, expect, it } from "vitest";
import {
  detectSensitivePage,
  EXTRACTION_CHARACTER_CAP,
  extractPageContext,
  extractStructuredText,
} from "../src/content/extraction";

function setUrl(url: string): void {
  window.history.pushState({}, "", url);
}

afterEach(() => {
  document.body.innerHTML = "";
  document.title = "";
});

describe("content sensitive-page detection", () => {
  it("blocks pages with password fields", () => {
    document.body.innerHTML = '<form><input type="password" /></form>';

    expect(detectSensitivePage()).toMatchObject({
      kind: "password-field",
    });
    expect(extractPageContext("full-page")).toMatchObject({
      status: "blocked",
      unavailable: {
        reason: "sensitive-page",
      },
    });
  });

  it("blocks payment fields detected from autocomplete and labels", () => {
    document.body.innerHTML = `
      <label for="card-number">Card number</label>
      <input id="card-number" autocomplete="cc-number" />
    `;

    expect(detectSensitivePage()).toMatchObject({
      kind: "payment-field",
    });
  });

  it("blocks account and auth pages with repeated account signals", () => {
    document.title = "Account settings";
    document.body.innerHTML = "<main>Sign in security settings and payment method</main>";

    expect(detectSensitivePage()).toMatchObject({
      kind: "auth-account-indicator",
    });
  });
});

describe("content extraction", () => {
  it("extracts structured text and metrics from readable page content", () => {
    document.title = "Test article";
    setUrl("https://example.com/article");
    document.body.innerHTML = `
      <main>
        <h1>Heading</h1>
        <p>First paragraph.</p>
        <ul><li>First item</li></ul>
        <pre>const value = 1;</pre>
        <table><tr><th>Name</th><td>Ask AI</td></tr></table>
      </main>
    `;

    expect(extractStructuredText()).toMatchObject({
      text: expect.stringContaining("# Heading"),
      truncated: false,
      metrics: {
        headingCount: 1,
        paragraphCount: 1,
        listCount: 1,
        codeBlockCount: 1,
        tableCount: 1,
      },
    });

    expect(extractPageContext("full-page")).toMatchObject({
      status: "available",
      context: {
        title: "Test article",
        url: "https://example.com/article",
        domain: "example.com",
        mode: "full-page",
        truncated: false,
      },
    });
  });

  it("keeps full-page context when text is selected", () => {
    setUrl("https://example.com/article");
    document.body.innerHTML = "<main><p>Alpha beta gamma.</p></main>";
    const paragraph = document.querySelector("p");
    const range = document.createRange();
    range.selectNodeContents(paragraph as Node);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    expect(extractPageContext("full-page")).toMatchObject({
      status: "available",
      context: {
        mode: "full-page",
        text: "Alpha beta gamma.",
        metrics: {
          characterCount: 17,
          extractedCharacterCount: 17,
          truncatedCharacterCount: 0,
        },
      },
    });
  });

  it("truncates long page text at the configured extraction cap", () => {
    document.body.innerHTML = `<main><p>${"a".repeat(EXTRACTION_CHARACTER_CAP + 10)}</p></main>`;

    const extraction = extractStructuredText();

    expect(extraction.truncated).toBe(true);
    expect(extraction.text).toContain("[Context truncated]");
    expect(extraction.metrics.truncatedCharacterCount).toBe(10);
  });
});
