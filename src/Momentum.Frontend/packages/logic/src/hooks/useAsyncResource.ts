import { useCallback, useEffect, useRef, useState } from "react";
import type { DataFamily } from "../components/LogicProvider.js";
import { useDataVersion } from "../components/LogicProvider.js";
import { AppError, toAppError } from "../errors/errors.js";

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
}

export interface AsyncResourceOptions {
  /** Skip the fetch entirely — for a detail view with no id selected yet. */
  enabled?: boolean;
  /** Families whose invalidation should refetch this resource. */
  invalidatedBy?: DataFamily[];
}

/**
 * The read half of every data hook.
 *
 * Three behaviours worth knowing about:
 *
 * - `key` exists because callers pass object literals. A fresh `{}` every render
 *   is a new reference, so depending on the object itself refetches forever.
 *   Callers pass a serialized key instead and the object travels by ref.
 * - The skeleton only shows on the first load. A refresh keeps the previous data
 *   on screen, because blanking a populated list to re-fetch the same rows reads
 *   as data loss.
 * - A response that arrives after the inputs changed is discarded. Without that,
 *   a slow first request can overwrite the results of a faster later one.
 */
export function useAsyncResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: AsyncResourceOptions,
): AsyncResource<T> {
  const enabled = options?.enabled ?? true;
  const version = useDataVersion(...(options?.invalidatedBy ?? []));

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<AppError | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const hasLoaded = useRef(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    if (!hasLoaded.current) setLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current();
      if (id !== requestId.current) return;
      setData(result);
      hasLoaded.current = true;
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(toAppError(caught));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    // `key` and `version` are the real inputs; `fetcher` travels by ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export interface Mutation<TInput, TResult> {
  mutate: (input: TInput) => Promise<TResult>;
  saving: boolean;
  error: AppError | null;
}

/**
 * The write half.
 *
 * Rethrows after recording the error so a caller can keep a modal open on failure,
 * while a caller that only needs the flag can ignore it.
 */
export function useMutation<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  options?: { invalidates?: DataFamily[]; onInvalidate?: (...families: DataFamily[]) => void },
): Mutation<TInput, TResult> {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const actionRef = useRef(action);
  actionRef.current = action;

  const invalidates = options?.invalidates;
  const onInvalidate = options?.onInvalidate;

  const mutate = useCallback(
    async (input: TInput): Promise<TResult> => {
      setSaving(true);
      setError(null);
      try {
        const result = await actionRef.current(input);
        if (onInvalidate && invalidates && invalidates.length > 0) {
          onInvalidate(...invalidates);
        }
        return result;
      } catch (caught) {
        const appError = toAppError(caught);
        setError(appError);
        throw appError;
      } finally {
        setSaving(false);
      }
    },
    [invalidates, onInvalidate],
  );

  return { mutate, saving, error };
}
