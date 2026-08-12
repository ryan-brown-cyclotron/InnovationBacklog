import shared from "../DetailPanel/DetailPanel.module.scss";
import own from "./SolutionPanel.module.scss";

/**
 * One class vocabulary for every file under this folder: the shared detail-panel
 * classes plus the ones that are genuinely about solutions.
 *
 * Merged here rather than imported twice per file so that moving a class between
 * the two stylesheets is one edit in one place — no component has to learn which
 * file its class ended up in, and none can silently keep referencing a name that
 * moved. A CSS Modules default export is a plain name -> hashed-name object, so the
 * spread is exactly what it looks like.
 *
 * `own` last: a solution-specific class of the same name deliberately wins.
 */
export default { ...shared, ...own } as Record<string, string>;
