import { vi } from "vitest";

export interface TestStorageArea {
  records: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

export interface InstalledChromeMock {
  local: TestStorageArea;
  session: TestStorageArea;
  sync: TestStorageArea;
  runtimeSendMessage: ReturnType<typeof vi.fn>;
  tabSendMessage: ReturnType<typeof vi.fn>;
}

export function createStorageArea(initialRecords: Record<string, unknown> = {}): TestStorageArea {
  const records = { ...initialRecords };

  return {
    records,
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (keys === undefined || keys === null) {
        return { ...records };
      }

      if (typeof keys === "string") {
        return { [keys]: records[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, records[key]]));
      }

      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [key, records[key] ?? fallback]),
      );
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete records[key];
      }
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(records, items);
    }),
  };
}

export function installChromeMock(
  options: {
    local?: Record<string, unknown>;
    session?: Record<string, unknown>;
    sync?: Record<string, unknown>;
    tabs?: Partial<typeof chrome.tabs>;
  } = {},
): InstalledChromeMock {
  const local = createStorageArea(options.local);
  const session = createStorageArea(options.session);
  const sync = createStorageArea(options.sync);
  const runtimeSendMessage = vi.fn((message: unknown, callback?: (response?: unknown) => void) => {
    callback?.(undefined);
    return Promise.resolve(message);
  });
  const tabSendMessage = vi.fn(
    (_tabId: number, _message: unknown, callback?: (response?: unknown) => void) => {
      callback?.(undefined);
      return Promise.resolve(undefined);
    },
  );

  vi.stubGlobal("chrome", {
    action: {
      onClicked: {
        addListener: vi.fn(),
      },
    },
    commands: {
      onCommand: {
        addListener: vi.fn(),
      },
    },
    contextMenus: {
      create: vi.fn(),
      onClicked: {
        addListener: vi.fn(),
      },
    },
    runtime: {
      getURL: vi.fn((path = "") => `chrome-extension://ask-ai/${path}`),
      lastError: undefined,
      onInstalled: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      openOptionsPage: vi.fn(),
      sendMessage: runtimeSendMessage,
    },
    sidePanel: {
      open: vi.fn(async () => undefined),
    },
    storage: {
      local,
      session,
      sync,
    },
    tabs: {
      get: vi.fn(async (tabId: number) => ({
        id: tabId,
        title: "Example",
        url: "https://example.com",
      })),
      onActivated: {
        addListener: vi.fn(),
      },
      onUpdated: {
        addListener: vi.fn(),
      },
      query: vi.fn(async () => [
        {
          active: true,
          currentWindow: true,
          id: 12,
          title: "Example",
          url: "https://example.com",
        },
      ]),
      sendMessage: tabSendMessage,
      ...options.tabs,
    },
  });

  return {
    local,
    session,
    sync,
    runtimeSendMessage,
    tabSendMessage,
  };
}
