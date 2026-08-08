import type React from "react";
import styles from "./PersonAvatar.module.scss";
import { initials, personName } from "../../utils";

export function PersonAvatar({
  id,
  tone = "user",
}: {
  id: string;
  tone?: string;
}): React.ReactElement {
  return (
    <span
      className={`${styles.avatar} ${styles[`avatar${tone}`] ?? ""}`}
      title={personName(id)}
      aria-label={personName(id)}
    >
      {initials(id)}
    </span>
  );
}
