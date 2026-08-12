import shell from "../Modal/ModalShell.module.scss";
import shared from "../DetailPanel/DetailPanel.module.scss";

/**
 * The shell's own classes plus the shared detail-panel vocabulary.
 *
 * Same arrangement as SolutionPanel/styles.ts, and for the same reason — see the
 * note there.
 *
 * `shared` last: `.bodyText` and `.rowRemove` exist in both, and inside the tab
 * bodies the detail-panel versions are the ones that belong. Nothing in this folder
 * still uses the shell's copies.
 */
export default { ...shell, ...shared } as Record<string, string>;
