import type React from "react";
import styles from "./Topbar.module.scss";

export function Topbar({
  onHome,
  onContribute,
  userName,
  userInitials,
  role,
  onMyWork,
  onSignOut,
  canGovern,
  approvalsCount,
  onApprovals,
}: {
  onHome: () => void;
  onContribute: () => void;
  userName: string;
  userInitials: string;
  role: string;
  onMyWork: () => void;
  onSignOut: () => void;
  canGovern?: boolean;
  approvalsCount?: number;
  onApprovals?: () => void;
}): React.ReactElement {
  return (
    <header className={styles.topbar}>
      <button className={styles.brand} onClick={onHome}>
        <span className={styles.brandMark}>M</span>
        <span>Innovation Hub</span>
      </button>
      <span className={styles.spacer} />
      <div className={styles.actions}>
        {/* One destination, not two. The review queue lives on "Your work", so a
            separate Approvals entry pointed at the same page — the badge is the part
            worth keeping, since it is the only at-a-glance signal that work is
            waiting. */}
        {canGovern && onApprovals && (
          <button className={styles.navButton} onClick={onApprovals}>
            Your work
            {(approvalsCount ?? 0) > 0 && (
              <span className={styles.badge}>{approvalsCount}</span>
            )}
          </button>
        )}
        <button className={styles.contributeButton} onClick={onContribute}>
          <span aria-hidden="true">+</span> Share
        </button>
        <details className={styles.userMenu}>
          <summary className={styles.userChip}>
            <span className={styles.avatarSm}>{userInitials}</span>
            {userName}
          </summary>
          <div className={styles.userDropdown}>
            <strong>{userName}</strong>
            <span className={styles.userRole}>{role}</span>
            <button onClick={onMyWork}>Your work</button>
            {/* An "Administration" entry used to sit here with no onClick and nothing
                behind it — a button that looked like a feature and did nothing. */}
            <button onClick={onSignOut}>Sign out</button>
          </div>
        </details>
      </div>
    </header>
  );
}
