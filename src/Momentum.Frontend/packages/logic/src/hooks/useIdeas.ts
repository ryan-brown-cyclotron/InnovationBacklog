import { useCallback } from "react";
import { useInvalidate, useProvider } from "../components/LogicProvider.js";
import type { PageResult } from "../domain/common.js";
import type { CreateIdeaInput, Idea, IdeaQuery, UpdateIdeaInput } from "../domain/idea.js";
import type { ItemVisibility } from "../domain/enums.js";
import type { AsyncResource } from "./useAsyncResource.js";
import { useAsyncResource, useMutation } from "./useAsyncResource.js";
import type { Mutation } from "./useAsyncResource.js";

export function useIdeas(
  query?: IdeaQuery,
  options?: { enabled?: boolean },
): AsyncResource<PageResult<Idea>> {
  const provider = useProvider();
  return useAsyncResource(
    JSON.stringify(query ?? {}),
    () => provider.ideas.listIdeas(query),
    { enabled: options?.enabled, invalidatedBy: ["ideas"] },
  );
}

export function useIdea(id: string | null): AsyncResource<Idea | null> {
  const provider = useProvider();
  return useAsyncResource(
    id ?? "",
    () => (id ? provider.ideas.getIdea(id) : Promise.resolve(null)),
    { enabled: Boolean(id), invalidatedBy: ["ideas"] },
  );
}

export function useCreateIdea(): Mutation<CreateIdeaInput, Idea> {
  const provider = useProvider();
  const invalidate = useInvalidate();
  return useMutation((input: CreateIdeaInput) => provider.ideas.createIdea(input), {
    invalidates: ["ideas"],
    onInvalidate: invalidate,
  });
}

export function useUpdateIdea(
  id: string,
): Mutation<UpdateIdeaInput, Idea> {
  const provider = useProvider();
  const invalidate = useInvalidate();
  return useMutation((patch: UpdateIdeaInput) => provider.ideas.updateIdea(id, patch), {
    invalidates: ["ideas"],
    onInvalidate: invalidate,
  });
}

/**
 * Null when this backend cannot change visibility at all.
 *
 * A surface checks for null and renders no control, rather than rendering one that
 * fails on click. Presence is not permission: a provider that has the capability
 * still rejects a non-administrator.
 */
export function useSetIdeaVisibility(
  id: string,
): ((visibility: ItemVisibility) => Promise<Idea>) | null {
  const provider = useProvider();
  const invalidate = useInvalidate();
  const setVisibility = provider.ideas.setIdeaVisibility;

  const run = useCallback(
    async (visibility: ItemVisibility) => {
      if (!setVisibility) throw new Error("setIdeaVisibility is not supported by this provider.");
      const updated = await setVisibility.call(provider.ideas, id, visibility);
      invalidate("ideas");
      return updated;
    },
    [provider, setVisibility, id, invalidate],
  );

  return setVisibility ? run : null;
}
