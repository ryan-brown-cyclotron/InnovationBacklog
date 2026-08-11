import type React from "react";
import styles from "./Topbar.module.scss";

export function Topbar({
  onHome,
  onContribute,
  userName,
  userInitials,
  role,
  onMyWork,
  onDashboard,
  onSignOut,
  pendingCount,
}: {
  onHome: () => void;
  onContribute: () => void;
  userName: string;
  userInitials: string;
  role: string;
  onMyWork: () => void;
  /** Absent when the backend cannot compute programme figures. */
  onDashboard?: () => void;
  onSignOut: () => void;
  /** Anything waiting on this person — the badge on My Work. */
  pendingCount?: number;
}): React.ReactElement {
  const pending = pendingCount ?? 0;

  return (
    <header className={styles.topbar}>
      <button className={styles.brand} onClick={onHome}>
        <span className={styles.brandMark}>M</span>
        <span>Innovation Hub</span>
      </button>
      <span className={styles.spacer} />
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
            <button className={styles.menuItem} onClick={onMyWork}>
              My Work
              {pending > 0 && <span className={styles.badge}>{pending}</span>}
            </button>
            {/* Beside My Work, because this menu is now the one place a person's own
                destinations live. Absent rather than disabled when the backend has no
                figures — a menu entry that leads to an empty page is worse than none. */}
            {onDashboard && (
              <button className={styles.menuItem} onClick={onDashboard}>
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
