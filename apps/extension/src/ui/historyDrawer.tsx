import Fuse from "fuse.js";
import { Globe, Search } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useSidepanelStore } from "../../store/sidepanelstore";
import type { HistoryEntry } from "../sidepanel/history";

interface HistoryDrawerProps {
  currentDomain?: string;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function formatRelativeTime(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    return "";
  }
  const diffMs = Date.now() - target;
  if (diffMs < MINUTE) {
    return "just now";
  }
  if (diffMs < HOUR) {
    return `${Math.floor(diffMs / MINUTE)}m ago`;
  }
  if (diffMs < DAY) {
    return `${Math.floor(diffMs / HOUR)}h ago`;
  }
  if (diffMs < DAY * 2) {
    return "yesterday";
  }
  if (diffMs < DAY * 7) {
    return `${Math.floor(diffMs / DAY)}d ago`;
  }
  return new Date(iso).toLocaleDateString();
}

export function HistoryDrawer({ currentDomain }: HistoryDrawerProps) {
  const historyOpen = useSidepanelStore((state) => state.historyOpen);
  const entries = useSidepanelStore((state) => state.historyEntries);
  const loading = useSidepanelStore((state) => state.historyLoading);
  const query = useSidepanelStore((state) => state.historyQuery);
  const closeHistory = useSidepanelStore((state) => state.closeHistory);
  const setHistoryQuery = useSidepanelStore((state) => state.setHistoryQuery);
  const openConversation = useSidepanelStore((state) => state.openConversation);

  const searchRef = useRef<HTMLInputElement | null>(null);

  const fuse = useMemo(() => {
    if (!entries || entries.length === 0) {
      return null;
    }
    return new Fuse(entries, {
      keys: [
        { name: "title", weight: 0.6 },
        { name: "firstUserMessage", weight: 0.3 },
        { name: "domain", weight: 0.1 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [entries]);

  useEffect(() => {
    if (!historyOpen) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeHistory();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [historyOpen, closeHistory]);

  if (!historyOpen) {
    return null;
  }

  const trimmedQuery = query.trim();
  const filtered =
    trimmedQuery && fuse ? fuse.search(trimmedQuery).map((result) => result.item) : (entries ?? []);

  const normalizedCurrent = currentDomain?.replace(/^www\./, "");
  const onPage = normalizedCurrent
    ? filtered.filter((entry) => entry.domain === normalizedCurrent)
    : [];
  const others = normalizedCurrent
    ? filtered.filter((entry) => entry.domain !== normalizedCurrent)
    : filtered;

  return (
    <>
      <button
        type="button"
        className="history-drawer-backdrop"
        onClick={closeHistory}
        aria-label="Close history"
        tabIndex={-1}
      />
      <aside className="history-drawer" role="dialog" aria-label="Chat history">
        <div className="history-search">
          <Search size={14} className="history-search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search conversations"
            value={query}
            onChange={(event) => setHistoryQuery(event.target.value)}
          />
        </div>
        <div className="history-body">
          {loading ? (
            <p className="history-empty">Loading conversations...</p>
          ) : !entries || entries.length === 0 ? (
            <p className="history-empty">
              No saved conversations yet — start chatting and they'll appear here.
            </p>
          ) : filtered.length === 0 ? (
            <p className="history-empty">No matches for &quot;{trimmedQuery}&quot;.</p>
          ) : (
            <>
              {onPage.length > 0 ? (
                <section className="history-group">
                  <h3 className="history-group-label">On this page ({normalizedCurrent})</h3>
                  <div className="history-rows">
                    {onPage.map((entry) => (
                      <HistoryRow key={entry.id} entry={entry} onPick={openConversation} />
                    ))}
                  </div>
                </section>
              ) : null}
              {others.length > 0 ? (
                <section className="history-group">
                  <h3 className="history-group-label">
                    {normalizedCurrent ? "Other conversations" : "All conversations"}
                  </h3>
                  <div className="history-rows">
                    {others.map((entry) => (
                      <HistoryRow key={entry.id} entry={entry} onPick={openConversation} />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function HistoryRow({
  entry,
  onPick,
}: {
  entry: HistoryEntry;
  onPick: (id: string) => Promise<void>;
}) {
  return (
    <button type="button" className="history-row" onClick={() => void onPick(entry.id)}>
      <span className="history-row-icon" aria-hidden="true">
        <Globe size={14} />
      </span>
      <span className="history-row-copy">
        <strong>{entry.title}</strong>
        {entry.firstUserMessage ? <small>{entry.firstUserMessage}</small> : null}
        <span className="history-row-meta">
          {entry.domain || "(no page)"} · {formatRelativeTime(entry.lastMessageAt)}
        </span>
      </span>
    </button>
  );
}
