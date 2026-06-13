import { IconButton } from "@askai/ui";
import { History, RefreshCw } from "lucide-react";
import newThreadIconUrl from "../../../../assets/icons/new_thread.svg";
import settingsIconUrl from "../../../../assets/icons/settings.svg";
import { useSidepanelStore } from "../../store/sidepanelstore";
import type { ContextState } from "../types/types";

export function HeaderActions({
  contextState,
  disabledNewChat,
  disabledRefresh,
  onNewChat,
  onRefresh,
}: {
  contextState: ContextState;
  disabledNewChat: boolean;
  disabledRefresh: boolean;
  onNewChat: () => void;
  onRefresh: () => void;
}) {
  const refreshing = contextState.status === "loading";
  const openHistory = useSidepanelStore((state) => state.openHistory);
  const historyOpen = useSidepanelStore((state) => state.historyOpen);

  return (
    <div className="header-actions">
      <IconButton
        className="header-icon-button header-icon-button-lucide"
        disabled={disabledRefresh || refreshing}
        label="Refresh current tab"
        onClick={onRefresh}
        title="Refresh tab"
      >
        <RefreshCw size={18} aria-hidden="true" className={refreshing ? "icon-spin" : undefined} />
      </IconButton>

      <IconButton
        aria-expanded={historyOpen}
        aria-haspopup="dialog"
        className="header-icon-button header-icon-button-lucide"
        label="Chat history"
        onClick={() => void openHistory()}
        title="History"
      >
        <History size={18} aria-hidden="true" />
      </IconButton>

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
        title="New chat"
      >
        <img src={newThreadIconUrl} alt="" />
      </IconButton>
    </div>
  );
}
