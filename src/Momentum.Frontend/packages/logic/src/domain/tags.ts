/**
 * Free-text labels on an idea or a solution.
 *
 * Tags are how people find work by technology, team, or theme, so they are normalized
 * on the way in — otherwise "Power Automate", "power automate", and " Power Automate "
 * become three tags that never match each other.
 *
 * Mirrors `Momentum.Library.Domain.Tagging.TagList.Normalize`: same limits, same
 * whitespace collapse, same case-insensitive dedupe keeping the first spelling.
 *
 * TWO DELIBERATE DIVERGENCES, both because Azure DevOps stores `System.Tags` as one
 * "; "-delimited string and cannot represent a separator inside a tag:
 *
 *   1. `;` and `,` are stripped, not preserved. A tag containing one round-trips as
 *      TWO tags, which is how a single label silently becomes two.
 *   2. Truncation trims afterwards. `TagList.cs:25` does this; the earlier private
 *      copy in the memory provider did not, so a cut landing mid-space left a tag
 *      ending in a space that then failed to dedupe against its trimmed twin.
 *
 * If `Momentum.Library` ever serves this app again, add the separator strip to
 * `TagList.cs` and delete divergence 1.
 */

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 32;

/** Characters that cannot survive a round trip through `System.Tags`. */
const SEPARATORS = /[;,]/g;

/**
 * Trimmed, whitespace-collapsed, separator-stripped, deduped case-insensitively
 * keeping the first spelling, capped at {@link MAX_TAGS}.
 *
 * A provider that skips this lets the same tag exist twice with different casing.
 */
export function normalizeTags(tags: readonly string[] | undefined | null): string[] {
  if (!tags) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    if (typeof raw !== "string") continue;

    let tag = raw.replace(SEPARATORS, " ").trim().replace(/\s+/g, " ");
    if (tag.length > MAX_TAG_LENGTH) tag = tag.slice(0, MAX_TAG_LENGTH).trimEnd();
    if (!tag) continue;

    // First spelling wins, so the original casing is what people see.
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(tag);
    if (result.length === MAX_TAGS) break;
  }

  return result;
}

/**
 * `"Azure, CI/CD"` -> `["Azure", "CI/CD"]`.
 *
 * What every tag input parses by hand today. Splitting on the same characters
 * `normalizeTags` strips is not a coincidence: a separator is either a delimiter
 * here or nothing at all, and this is the one place it gets to be a delimiter.
 */
export function parseTags(input: string): string[] {
  return normalizeTags(input.split(SEPARATORS));
}

/** Whether any tag matches the query. Mirrors `TagList.Matches`. */
export function tagsMatch(tags: readonly string[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return tags.some((tag) => tag.toLowerCase().includes(needle));
}
