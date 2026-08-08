import type React from "react";
import styles from "./AvatarStack.module.scss";
import { PersonAvatar } from "../PersonAvatar/PersonAvatar";

export function AvatarStack({ people }: { people: string[] }): React.ReactElement | null {
  if (people.length === 0)
    return <span className={styles.placeholder}>Participation will appear here</span>;
  return (
    <span className={styles.stack} aria-label={`${people.length} recent contributors`}>
      {people.slice(0, 3).map((person) => (
        <PersonAvatar id={person} key={person} />
      ))}
      {people.length > 3 && <span className={styles.more}>+{people.length - 3}</span>}
    </span>
  );
}
