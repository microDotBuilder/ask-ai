import { IconButton } from "@askai/ui";
import { useEffect, useRef } from "react";
import { useSidepanelStore } from "../../store/sidepanelstore";
import type { ContextState, ContextSummary } from "../types/types";
import { StatusBadge } from "./components/statusBadge";
import infoIconUrl from "../../../../assets/icons/info.svg";
import newThreadIconUrl from "../../../../assets/icons/new_thread.svg";
import settingsIconUrl from "../../../../assets/icons/settings.svg";

export function HeaderActions({
  contextSummary,
  contextState,
  disabledNewChat,
  onNewChat,
  onRefresh,
}: {
  contextSummary: ContextSummary | null;
  contextState: ContextState;
  disabledNewChat: boolean;
  onNewChat: () => void;
  onRefresh: () => void;
}) {
  const infoOpen = useSidepanelStore((state) => state.headerInfoOpen);
  const setInfoOpen = useSidepanelStore((state) => state.setHeaderInfoOpen);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!infoOpen) {
      return undefined;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setInfoOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInfoOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [infoOpen, setInfoOpen]);

  return (
    <div ref={menuRef} className="header-actions">
      <div className="header-menu">
        <IconButton
          aria-expanded={infoOpen}
          aria-haspopup="dialog"
          className="header-icon-button"
          label="Page info"
          onClick={() => setInfoOpen(!infoOpen)}
        >
          <img src={infoIconUrl} alt="" />
        </IconButton>

        {infoOpen ? (
          <div className="header-popover page-popover" role="dialog" aria-label="Page info">
            <div>
              <p>Page</p>
              <strong>{contextSummary?.title ?? "Current tab"}</strong>
            </div>
            <div>
              <p>Domain</p>
              <strong>{contextSummary?.domain ?? "Unavailable"}</strong>
            </div>
            <div>
              <p>Status</p>
              <StatusBadge state={contextState} />
            </div>
            <button className="popover-action" onClick={onRefresh} type="button">
              Retry context
            </button>
          </div>
        ) : null}
      </div>

      <IconButton
        className="header-icon-button"
        label="Open settings"
        onClick={() => chrome.runtime.openOptionsPage()}
        title="Settings"
      >
        <img src={settingsIconUrl} alt="" />
      </IconButton>

      <IconButton
        className="header-icon-button"
        disabled={disabledNewChat}
        label="New chat"
        onClick={onNewChat}
      >
        <img src={newThreadIconUrl} alt="" />
      </IconButton>
    </div>
  );
}
