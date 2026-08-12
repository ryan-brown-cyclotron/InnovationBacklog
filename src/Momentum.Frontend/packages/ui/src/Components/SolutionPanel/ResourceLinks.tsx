import type React from "react";
import styles from "./styles";
import type { Solution } from "../../types";

/**
 * Where to actually go and look at the thing.
 *
 * One card shape for both links rather than two bespoke rows: the label says which
 * kind of resource it is, so the value underneath is free to be the address, and a
 * third kind later is a new entry rather than new markup.
 */
export function ResourceLinks({ solution }: { solution: Solution }): React.ReactElement | null {
  const resources = [
    solution.demoUrl && {
      key: "demo",
      icon: "▶",
      label: "Demo",
      value: linkLabel(solution.demoUrl),
      href: solution.demoUrl,
    },
    solution.repositoryUrl && {
      key: "repo",
      icon: "{ }",
      label: "Repository",
      // The owner/name pair is what people recognise a repo by; the host is noise.
      value:
        solution.repositoryOwner && solution.repositoryName
          ? `${solution.repositoryOwner}/${solution.repositoryName}`
          : linkLabel(solution.repositoryUrl),
      href: solution.repositoryUrl,
    },
  ].filter(Boolean) as {
    key: string;
    icon: string;
    label: string;
    value: string;
    href: string;
  }[];

  if (resources.length === 0) return null;

  return (
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>Resources</h3>
      <ul className={styles.resourceList}>
        {resources.map((resource) => (
          <li key={resource.key}>
            <a
              className={styles.resourceCard}
              href={resource.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={styles.resourceIcon} aria-hidden="true">
                {resource.icon}
              </span>
              <span className={styles.resourceText}>
                <span className={styles.resourceLabel}>{resource.label}</span>
                <span className={styles.resourceValue}>{resource.value}</span>
              </span>
              <span className={styles.resourceArrow} aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Host and path, so a long URL still fits on one line and stays recognisable. */
function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}
