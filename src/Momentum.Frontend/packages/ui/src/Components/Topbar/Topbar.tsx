import type React from "react";
import type { DiscoveryItem, View } from "../../types";
import { CommandSearch } from "../CommandSearch/CommandSearch";
import styles from "./Topbar.module.scss";

export function Topbar({
  view,
  onNavigate,
  onContribute,
  userName,
  userInitials,
  role,
  showDashboard,
  onSignOut,
  pendingCount,
  query,
  setQuery,
  onSearch,
  onOpenItem,
  searchBusy,
}: {
  view: View;
  onNavigate: (v: View) => void;
  onContribute: () => void;
  userName: string;
  userInitials: string;
  role: string;
  /** Absent when the backend cannot compute programme figures. */
  showDashboard?: boolean;
  onSignOut: () => void;
  /** Anything waiting on this person — the badge on My Work. */
  pendingCount?: number;
  query: string;
  setQuery: (q: string) => void;
  onSearch: () => void;
  onOpenItem: (item: DiscoveryItem) => void;
  searchBusy: boolean;
}): React.ReactElement {
  const pending = pendingCount ?? 0;

  return (
    <header className={styles.topbar}>
      <button className={styles.brand} onClick={() => onNavigate("home")}>
        <span className={styles.brandMark}>M</span>
        <span>Innovation Hub</span>
      </button>
      <div className={styles.searchWrapper}>
        <CommandSearch
          query={query}
          setQuery={setQuery}
          onSearch={onSearch}
          onOpenItem={onOpenItem}
          busy={searchBusy}
        />
      </div>
      <div className={styles.actions}>
        {/* Share is the only thing in the bar. "Your work" was here AND in the menu
            below, both going to the same page — a duplicated entry that made the bar
            look like navigation while offering one destination. It lives in the menu,
            which is where a person looks for their own things. */}
        <button className={styles.contributeButton} onClick={onContribute}>
          <span aria-hidden="true">+</span> Share
        </button>
        <details className={styles.userMenu}>
          <summary className={styles.userChip}>
            <span className={styles.avatarSm}>
              {userInitials}
              {/* The count itself is inside the menu, so a closed menu needs some
                  mark or the badge only exists for people who already went looking.
                  A dot says "something is in here" without asserting a number. */}
              {pending > 0 && <span className={styles.pendingPip} aria-hidden="true" />}
            </span>
            {userName}
            {pending > 0 && (
              <span className={styles.srOnly}>{pending} items awaiting you</span>
            )}
          </summary>
          <div className={styles.userDropdown}>
            <strong>{userName}</strong>
            <span className={styles.userRole}>{role}</span>
            <button className={styles.menuItem} onClick={() => onNavigate("requests")}>
              My Work
              {pending > 0 && <span className={styles.badge}>{pending}</span>}
            </button>
            {/* Beside My Work, because this menu is now the one place a person's own
                destinations live. Absent rather than disabled when the backend has no
                figures — a menu entry that leads to an empty page is worse than none. */}
            {showDashboard && (
              <button className={styles.menuItem} onClick={() => onNavigate("dashboard")}>
                Dashboard
              </button>
            )}
            {/* An "Administration" entry used to sit here with no onClick and nothing
                behind it — a button that looked like a feature and did nothing. */}
            <button className={styles.menuItem} onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
