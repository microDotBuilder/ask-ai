import {
  parseChromeMessage,
  parseRuntimeMessageResponse,
  parseTabMessageResponse,
  safeParseChromeMessage,
  type ChromeMessage,
  type RuntimeMessageResponse,
  type TabMessageResponse,
} from "@askai/core";

export type ChromeTabId = number;

export interface ChromeMessageSender {
  tab?: chrome.tabs.Tab;
  frameId?: number;
  id?: string;
  url?: string;
}

export class ChromeMessageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ChromeMessageError";
  }
}

function runtimeError(message: string): ChromeMessageError {
  return new ChromeMessageError(message, chrome.runtime.lastError);
}

function decodeError(scope: string, cause: unknown): ChromeMessageError {
  return new ChromeMessageError(`Invalid ${scope} message payload.`, cause);
}

export async function sendRuntimeMessage<TMessage extends ChromeMessage>(
  message: TMessage,
): Promise<RuntimeMessageResponse<TMessage>> {
  const parsedMessage = parseChromeMessage(message) as TMessage;

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(parsedMessage, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(runtimeError(error.message ?? "Chrome runtime message failed"));
        return;
      }

      try {
        resolve(parseRuntimeMessageResponse(parsedMessage, response));
      } catch (cause) {
        reject(decodeError("runtime response", cause));
      }
    });
  });
}

export async function sendTabMessage<TMessage extends ChromeMessage>(
  tabId: ChromeTabId,
  message: TMessage,
): Promise<TabMessageResponse<TMessage>> {
  const parsedMessage = parseChromeMessage(message) as TMessage;

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, parsedMessage, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(runtimeError(error.message ?? "Chrome tab message failed"));
        return;
      }

      try {
        resolve(parseTabMessageResponse(parsedMessage, response));
      } catch (cause) {
        reject(decodeError("tab response", cause));
      }
    });
  });
}

export function addChromeMessageListener(
  handler: (
    message: ChromeMessage,
    sender: ChromeMessageSender,
  ) => Promise<ChromeMessage | undefined> | ChromeMessage | undefined,
): () => void {
  const listener = (
    rawMessage: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    const parsed = safeParseChromeMessage(rawMessage);

    if (!parsed.ok) {
      return false;
    }

    Promise.resolve(handler(parsed.message, sender))
      .then((response) => {
        if (response) {
          parseChromeMessage(response);
          sendResponse(response);
          return;
        }

        sendResponse();
      })
      .catch((error) => {
        console.error("Ask AI message handler failed", error);
        sendResponse();
      });

    return true;
  };

  chrome.runtime.onMessage.addListener(listener);

  return () => {
    chrome.runtime.onMessage.removeListener(listener);
  };
}
