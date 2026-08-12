import type React from "react";
import styles from "./PersonAvatar.module.scss";
import { initials, personName } from "../../utils";

export function PersonAvatar({
  id,
  tone = "user",
  size,
}: {
  id: string;
  tone?: string;
  /**
   * A fixed circle instead of one sized by its own glyphs.
   *
   * Optional, and the default stays sizeless on purpose: `AvatarStack` sizes these
   * from the outside, and giving the base class dimensions would silently resize
   * every existing caller.
   */
  size?: "sm" | "md";
}): React.ReactElement {
  const sized = size ? styles[`avatar${size}`] : "";
  return (
    <span
      className={`${styles.avatar} ${styles[`avatar${tone}`] ?? ""} ${sized ?? ""}`.trim()}
      title={personName(id)}
      aria-label={personName(id)}
    >
      {initials(id)}
    </span>
  );
}
