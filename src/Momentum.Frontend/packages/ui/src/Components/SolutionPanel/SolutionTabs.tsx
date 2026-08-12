import { useRef } from "react";
import type React from "react";
import styles from "./SolutionPanel.module.scss";

export type SolutionTab = "overview" | "activity" | "issues" | "adoption";

export interface TabSpec {
  id: SolutionTab;
  label: string;
  /** Omitted when there is nothing meaningful to count. */
  count?: number;
  /** What the count means, for the accessible name: "Issues, 3 open". */
  countLabel?: string;
}

export const tabId = (tab: SolutionTab) => `solution-tab-${tab}`;
export const panelId = (tab: SolutionTab) => `solution-panel-${tab}`;

/**
 * The strip. Deliberately more than the tab pattern on the My Work page, which sets
 * `role`/`aria-selected` but omits `aria-controls` and roving tabindex — so a screen
 * reader is told these are tabs without being told what they control, and every tab
 * is a separate stop on the way to the panel.
 *
 * Activation is automatic (selecting on arrow key, not on Enter). All four panels'
 * data is already in props, so there is no fetch to justify making the reader confirm.
 */
export function SolutionTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly TabSpec[];
  active: SolutionTab;
  onChange: (tab: SolutionTab) => void;
}): React.ReactElement {
  const strip = useRef<HTMLDivElement>(null);

  function move(delta: number | "first" | "last") {
    const index = tabs.findIndex((tab) => tab.id === active);
    if (index < 0) return;

    const next =
      delta === "first"
        ? 0
        : delta === "last"
          ? tabs.length - 1
          : (index + delta + tabs.length) % tabs.length;

    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    // Focus follows selection, so the arrow keys move the reader as well as the view.
    strip.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(target.id))}`)
      ?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        move("first");
        break;
      case "End":
        event.preventDefault();
        move("last");
        break;
      default:
        break;
    }
  }

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label="Solution detail"
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(tab.id)}
            // Roving: one Tab press from the strip lands in the panel, not on the
            // next tab.
            tabIndex={selected ? 0 : -1}
            aria-label={
              tab.count === undefined
                ? undefined
                : `${tab.label}, ${tab.count} ${tab.countLabel ?? ""}`.trim()
            }
            className={`${styles.tab} ${selected ? styles.tabActive : ""}`.trim()}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {/* Folded into aria-label above, so it is not read as part of the name. */}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={styles.tabCount} aria-hidden="true">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The scroll container behind one tab. */
export function TabPanel({
  tab,
  children,
}: {
  tab: SolutionTab;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      id={panelId(tab)}
      role="tabpanel"
      aria-labelledby={tabId(tab)}
      // Required, not decorative: every panel scrolls, and a scrollable region with
      // no focusable descendant cannot be reached or scrolled by keyboard at all.
      tabIndex={0}
      className={styles.panel}
    >
      {children}
    </div>
  );
}
