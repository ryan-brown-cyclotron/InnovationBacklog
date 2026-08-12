import { useEffect, useState } from "react";
import type React from "react";
import styles from "./SolutionPanel.module.scss";
import type { Request, RequestSummary, SearchItem, SearchResult } from "../../types";
import { useApi } from "../../Hooks/useApi";
import { isIdeaItem, upvoteCountLabel } from "../../utils";

/**
 * The ideas this solution answers, and the search for connecting another.
 *
 * The search lives here rather than in the panel because nothing else reads its four
 * pieces of state or its debounce. It was in the panel only because there was nowhere
 * smaller for it to be.
 */
export function LinkedIdeas({
  linkedNeeds,
  requestSummary,
  onOpenRequest,
  onLink,
  onUnlink,
}: {
  linkedNeeds: Request[];
  requestSummary: RequestSummary;
  onOpenRequest: (request: Request) => void;
  onLink: (requestId: string) => Promise<void>;
  onUnlink: (requestId: string) => Promise<void>;
}): React.ReactElement {
  const api = useApi();
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
        // /api/search spans everyone's ideas; /api/requests is only your own.
        const result = await api<SearchResult>(
          `/api/search?query=${encodeURIComponent(query)}&take=10`,
        );
        const linked = new Set(linkedNeeds.map((need) => need.id));
        setResults(
          result.items.filter(
            (item) => isIdeaItem(item.itemType) && !linked.has(item.itemId),
          ),
        );
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, linkedNeeds]);

  async function link(requestId: string) {
    await onLink(requestId);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>Ideas this supports</h3>
        {!open && (
          <button
            type="button"
            className={styles.blockAction}
            onClick={() => setOpen(true)}
          >
            + Connect
          </button>
        )}
      </div>

      {linkedNeeds.length === 0 ? (
        <p className={styles.muted}>This solution is not connected to an idea yet.</p>
      ) : (
        <ul className={styles.ideaList}>
          {linkedNeeds.map((need) => {
            const upvotes = requestSummary[need.id]?.votes ?? 0;
            return (
              <li key={need.id} className={styles.ideaRow}>
                <button
                  type="button"
                  className={styles.ideaOpen}
                  onClick={() => onOpenRequest(need)}
                >
                  <span className={styles.ideaTitle}>{need.title}</span>
                  <span className={styles.ideaMeta}>
                    {upvotes > 0 ? upvoteCountLabel(upvotes) : "No upvotes yet"}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.rowRemove}
                  aria-label={`Disconnect ${need.title}`}
                  title="Disconnect"
                  onClick={() => void onUnlink(need.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className={styles.search}>
          <input
            className={styles.searchInput}
            type="text"
            value={query}
            placeholder="Search ideas to connect…"
            aria-label="Search ideas to connect"
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
            <span className={styles.searchHint}>No ideas found.</span>
          )}
        </div>
      )}
    </div>
  );
}
