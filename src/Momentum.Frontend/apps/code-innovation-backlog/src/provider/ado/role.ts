import type { Role } from "@innovation-backlog/logic";
import type { AdoClient } from "./client.js";

/**
 * The caller's role, derived from what Azure DevOps says they may actually do.
 *
 * Group membership would be the obvious source, but Graph lives on the `vssps`
 * host and the connector's HttpRequest is relative to `dev.azure.com`, so it is
 * unreachable from a code app.
 *
 * The permissions API is reachable, and is a better answer anyway. The area paths
 * already carry the ACLs that enforce visibility — `\Approvers` is writable only by
 * the Approvers group and Project Administrators, `\Hidden` only by administrators.
 * Reading effective permission on those nodes asks the same question the server
 * will ask when the write happens, so the UI and the enforcement cannot disagree.
 * Deriving it from group membership instead would be a second source of truth that
 * could drift from the ACLs.
 *
 * Fails closed: anything unexpected resolves to Submitter. A submitter's view of an
 * approver's data is a missing button; the reverse is a disclosure.
 */

/** Common Structure Service — the namespace that owns area/iteration permissions. */
const CSS_NAMESPACE = "83e28ad4-2d72-4ceb-97b0-c7726d5502c3";
const WORK_ITEM_WRITE = 32;

interface AreaNode {
  identifier: string;
  name: string;
  children?: AreaNode[];
}

export function createRoleResolver(client: AdoClient): () => Promise<Role> {
  let pending: Promise<Role> | null = null;

  async function nodeToken(areas: AreaNode, leaf: string): Promise<string | null> {
    const child = (areas.children ?? []).find((node) => node.name === leaf);
    if (!child) return null;
    // Classification tokens are hierarchical and built from node GUIDs, not names.
    return `vstfs:///Classification/Node/${areas.identifier}:vstfs:///Classification/Node/${child.identifier}`;
  }

  /**
   * The response shape depends on how many tokens were asked about: a single token
   * answers with a bare `true`, several with `{ count, value: [...] }`. Assuming
   * the array form silently resolved every caller to Submitter, because
   * `Array.isArray(true)` is false and the check fell through to its default.
   */
  async function canWrite(token: string): Promise<boolean> {
    const result = await client.get<boolean | boolean[] | { value?: boolean[] }>(
      `/_apis/permissions/${CSS_NAMESPACE}/${WORK_ITEM_WRITE}?tokens=${encodeURIComponent(token)}`,
      "check area permission",
      "7.1-preview.1",
    );

    if (typeof result === "boolean") return result;
    if (Array.isArray(result)) return result[0] === true;
    return result?.value?.[0] === true;
  }

  async function resolve(): Promise<Role> {
    try {
      const areas = await client.get<AreaNode>(
        "_apis/wit/classificationnodes/areas?$depth=2",
        "read area paths",
      );

      const hidden = await nodeToken(areas, "Hidden");
      if (hidden && (await canWrite(hidden))) return "Administrator";

      const approvers = await nodeToken(areas, "Approvers");
      if (approvers && (await canWrite(approvers))) return "Approver";

      return "Submitter";
    } catch {
      return "Submitter";
    }
  }

  // Memoized: nothing about the answer changes mid-session, and it costs three
  // calls that would otherwise repeat on every render that reads the role.
  return () => (pending ??= resolve());
}
