import type React from "react";
import styles from "./WorkGroup.module.scss";
import type { Request } from "../../types";
import { Status } from "../Status/Status";

export function WorkGroup({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: Request[];
  onOpen: (item: Request) => void;
}): React.ReactElement {
  return (
    <section className={styles.group}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.list}>
        {items.map((item) => (
          <button
            className={styles.row}
            key={item.id}
            onClick={() => onOpen(item)}
          >
            <span className={styles.content}>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            <Status value={item.status} />
          </button>
        ))}
      </div>
    </section>
  );
}
