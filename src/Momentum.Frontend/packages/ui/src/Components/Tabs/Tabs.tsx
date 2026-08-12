import { useRef } from "react";
import type React from "react";
import styles from "./Tabs.module.scss";

/**
 * One tab. `Id` is the caller's own union — the solution modal's four tabs and the
 * idea modal's three are different sets, and neither should be able to pass one of
 * the other's ids by accident.
 */
export interface TabSpec<Id extends string = string> {
  id: Id;
  label: string;
  /** Omitted when there is nothing meaningful to count. */
  count?: number;
  /** What the count means, for the accessible name: "Issues, 3 open". */
  countLabel?: string;
}

/**
 * `group` namespaces the DOM ids so two tabbed surfaces can be mounted at once —
 * `aria-controls` points at an id, and two strips both claiming `tab-overview`
 * would wire a reader to whichever rendered first.
 */
export const tabId = (group: string, tab: string) => `${group}-tab-${tab}`;
export const panelId = (group: string, tab: string) => `${group}-panel-${tab}`;

/**
 * The strip. Deliberately more than the tab pattern on the My Work page, which sets
 * `role`/`aria-selected` but omits `aria-controls` and roving tabindex — so a screen
 * reader is told these are tabs without being told what they control, and every tab
 * is a separate stop on the way to the panel.
 *
 * Activation is automatic (selecting on arrow key, not on Enter). Every panel's data
 * is already in props, so there is no fetch to justify making the reader confirm.
 */
export function Tabs<Id extends string>({
  group,
  label,
  tabs,
  active,
  onChange,
}: {
  group: string;
  /** Names the strip for a screen reader, e.g. "Solution detail". */
  label: string;
  tabs: readonly TabSpec<Id>[];
  active: Id;
  onChange: (tab: Id) => void;
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
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(group, target.id))}`)
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
      aria-label={label}
      className={styles.tabList}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={tabId(group, tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(group, tab.id)}
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
  group,
  tab,
  children,
}: {
  group: string;
  tab: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      id={panelId(group, tab)}
      role="tabpanel"
      aria-labelledby={tabId(group, tab)}
      // Required, not decorative: every panel scrolls, and a scrollable region with
      // no focusable descendant cannot be reached or scrolled by keyboard at all.
      tabIndex={0}
      className={styles.panel}
    >
      {children}
    </div>
  );
}
