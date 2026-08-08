import type React from "react";
import styles from "./PageHeader.module.scss";

export function PageHeader({
  title,
  detail,
}: {
  title: string;
  detail: string;
}): React.ReactElement {
  return (
    <header className={styles.header}>
      <div>
        <h1>{title}</h1>
      </div>
      <p>{detail}</p>
    </header>
  );
}
