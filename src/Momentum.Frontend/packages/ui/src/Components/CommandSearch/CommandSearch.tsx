import { useEffect, useRef, useState } from "react";
import type React from "react";
import styles from "./CommandSearch.module.scss";
import type { DiscoveryItem, SearchResult } from "../../types";
import { useApi } from "../../Hooks/useApi";
import { isSolutionItem, itemKindLabel } from "../../utils";

export function CommandSearch({
  query,
  setQuery,
  onSearch,
  onOpenItem,
  busy,
}: {
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
  onOpenItem: (item: DiscoveryItem) => void;
  busy: boolean;
}): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const api = useApi();
  const [preview, setPreview] = useState<DiscoveryItem[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPreview([]);
      setPreviewOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const result = await api<SearchResult>(
          `/api/search?query=${encodeURIComponent(trimmed)}&take=5`,
        );
        setPreview(
          result.items.map((item) => ({
            ...item,
            kind: isSolutionItem(item.itemType) ? "Solution" : "Need",
            source: isSolutionItem(item.itemType) ? "solution" : "request",
          })),
        );
        setPreviewOpen(true);
      } catch {
        setPreview([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className={styles.searchWrap}>
      <form
        className={styles.commandSearch}
        onSubmit={(event) => {
          event.preventDefault();
          setPreviewOpen(false);
          onSearch();
        }}
      >
        <span className={styles.searchGlyph} aria-hidden="true">⌕</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (preview.length > 0) setPreviewOpen(true);
          }}
          onBlur={() => {
            // Delay so a preview click registers before the dropdown closes.
            setTimeout(() => setPreviewOpen(false), 150);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPreviewOpen(false);
          }}
          placeholder="Search ideas, solutions, people, and teams"
          aria-label="Search Innovation Hub"
          role="combobox"
          aria-expanded={previewOpen && preview.length > 0}
        />
        <kbd>Ctrl K</kbd>
        <button disabled={busy}>{busy ? "Searching…" : "Search"}</button>
      </form>
      {previewOpen && preview.length > 0 && (
        <ul className={styles.preview} role="listbox">
          {preview.map((item) => (
            <li key={`${item.source}-${item.itemId}`}>
              <button
                className={styles.previewItem}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setPreviewOpen(false);
                  onOpenItem(item);
                }}
              >
                <span
                  className={`${styles.previewKind} ${item.kind === "Solution" ? styles.previewSolution : styles.previewNeed}`}
                >
                  {itemKindLabel(item.source)}
                </span>
                <span className={styles.previewTitle}>{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
