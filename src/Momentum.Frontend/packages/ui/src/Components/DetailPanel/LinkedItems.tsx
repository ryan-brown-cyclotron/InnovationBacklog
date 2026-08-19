import { useEffect, useState } from "react";
import type React from "react";
import styles from "./DetailPanel.module.scss";
import type { SearchItem } from "../../types";

/** One row in the list: whatever the caller wants shown, already resolved. */
export interface LinkedItemRow {
  id: string;
  title: string;
  /** The second line, e.g. "12 upvotes" or "Piloting · Used by 3 teams". */
  meta: string;
}

/**
 * The records on the other side of a link, and the search for connecting another.
 *
 * Both directions of the same relationship: the ideas a solution answers, and the
 * solutions being tried against an idea. It was `LinkedIdeas` while only one of
 * those had a home — everything except the nouns and which endpoint is searched was
 * already symmetric.
 *
 * The search lives here rather than in the panel because nothing else reads its four
 * pieces of state or its debounce. `search` is the caller's, because "what may be
 * linked to this" is the one genuinely asymmetric part: a solution searches every
 * idea, an idea searches the catalogue.
 */
export function LinkedItems({
  title,
  items,
  emptyText,
  addLabel,
  searchLabel,
  noResultsText,
  removeVerb,
  canUnlink,
  pendingItems,
  search,
  onOpen,
  onLink,
  onUnlink,
}: {
  title: string;
  items: LinkedItemRow[];
  emptyText: string;
  /** The affordance that opens the search, e.g. "+ Connect". */
  addLabel: string;
  /** Placeholder and accessible name for the search box. */
  searchLabel: string;
  noResultsText: string;
  /** Verb for the remove button's label: "Disconnect", "Remove". */
  removeVerb: string;
  /**
   * Whether the reader may take an existing link away.
   *
   * Linking has no equivalent flag because it is open to anyone who can see both items.
   * Removing is not: adding a claim is cheap and reversible, dropping somebody else's
   * leaves nothing behind but an activity row, so the two are deliberately asymmetric.
   * Both buttons used to be shown to everyone while the provider refused both, which
   * meant an ordinary reader was invited to do two things that could only fail.
   */
  canUnlink: boolean;
  /**
   * Proposed and waiting on a reviewer.
   *
   * Rendered separately and never mixed into `items`, because they are not true yet —
   * an approved link is a claim the hub stands behind, a proposal is one person's
   * suggestion. They are shown at all because nothing is written to Azure DevOps until
   * approval, so without this the person who proposed one sees the panel exactly as it
   * was before they clicked and reasonably concludes it failed.
   */
  pendingItems?: LinkedItemRow[];
  /** Candidates for `query`, already filtered to what may be linked. */
  search: (query: string) => Promise<SearchItem[]>;
  onOpen: (id: string) => void;
  onLink: (id: string) => Promise<void>;
  onUnlink: (id: string) => Promise<void>;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await search(query));
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(handle);
    // `search` is a fresh closure every render — depending on it would restart the
    // debounce on each keystroke of anything else on the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, items]);

  async function link(id: string) {
    await onLink(id);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>{title}</h3>
        {!open && (
          <button
            type="button"
            className={styles.blockAction}
            onClick={() => setOpen(true)}
          >
            {addLabel}
          </button>
        )}
      </div>

      {items.length === 0 && (pendingItems?.length ?? 0) === 0 ? (
        <p className={styles.muted}>{emptyText}</p>
      ) : (
        <ul className={styles.ideaList}>
          {items.map((item) => (
            <li key={item.id} className={styles.ideaRow}>
              <button
                type="button"
                className={styles.ideaOpen}
                onClick={() => onOpen(item.id)}
              >
                <span className={styles.ideaTitle}>{item.title}</span>
                <span className={styles.ideaMeta}>{item.meta}</span>
              </button>
              {canUnlink && (
                <button
                  type="button"
                  className={styles.rowRemove}
                  aria-label={`${removeVerb} ${item.title}`}
                  title={removeVerb}
                  onClick={() => void onUnlink(item.id)}
                >
                  ×
                </button>
              )}
            </li>
          ))}

          {/*
            Proposals, after the approved rows and visibly not among them. No open
            handler and no remove: until a reviewer decides, the claim is not the hub's
            to stand behind, and the person who proposed it cannot take it back through
            this control — unlinking is for approved links.
          */}
          {pendingItems?.map((item) => (
            <li key={`pending-${item.id}`} className={`${styles.ideaRow} ${styles.ideaPending}`}>
              <span className={styles.ideaOpen}>
                <span className={styles.ideaTitle}>{item.title}</span>
                <span className={styles.ideaMeta}>{item.meta}</span>
              </span>
              <span className={styles.pendingTag}>Waiting for review</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className={styles.search}>
          <input
            className={styles.searchInput}
            type="text"
            value={query}
            placeholder={searchLabel}
            aria-label={searchLabel}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                // Element handler, not window — see DescriptionEditor.
                event.stopPropagation();
                setQuery("");
                setOpen(false);
              }
            }}
          />
          {busy && <span className={styles.searchHint}>Searching…</span>}
          {results.length > 0 && (
            <ul className={styles.searchResults}>
              {results.map((item) => (
                <li key={item.itemId}>
                  <button
                    type="button"
                    className={styles.searchResult}
                    onClick={() => void link(item.itemId)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!busy && query.trim() && results.length === 0 && (
            <span className={styles.searchHint}>{noResultsText}</span>
          )}
        </div>
      )}
    </div>
  );
}
