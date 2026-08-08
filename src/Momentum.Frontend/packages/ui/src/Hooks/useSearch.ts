import { useCallback, useState } from "react";
import { useApi } from "./useApi";
import type { DiscoveryItem, DiscoveryScope, SearchResult } from "../types";
import { errorText, isIdeaItem, isSolutionItem } from "../utils";

export function useSearch() {
  const [results, setResults] = useState<DiscoveryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();

  const search = useCallback(
    async (query: string, scope: DiscoveryScope = "all") => {
      setBusy(true);
      try {
        // One endpoint for every scope: /api/search spans both kinds and is the
        // only route that returns `itemId` for ideas as well as solutions.
        const response = await api<SearchResult>(
          `/api/search?query=${encodeURIComponent(query)}&take=25`,
        );
        setResults(
          response.items
            .filter((item) => {
              if (scope === "needs") return isIdeaItem(item.itemType);
              if (scope === "solutions") return isSolutionItem(item.itemType);
              return true;
            })
            .map((item) => {
              const isSolution = isSolutionItem(item.itemType);
              return {
                ...item,
                kind: isSolution ? ("Solution" as const) : ("Need" as const),
                source: isSolution ? ("solution" as const) : ("request" as const),
              };
            }),
        );
      } catch (reason) {
        setError(errorText(reason));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { results, busy, error, setError, search };
}
