import type React from "react";
import styles from "./ResultCard.module.scss";
import type { DiscoveryItem } from "../../types";
import { Status } from "../Status/Status";
import { itemKindLabel } from "../../utils";

export function ResultCard({
  item,
  onOpen,
}: {
  item: DiscoveryItem;
  onOpen: (item: DiscoveryItem) => void;
}): React.ReactElement {
  return (
    <button
      className={styles.card}
      onClick={() => onOpen(item)}
    >
      <span className={styles.kind}>{itemKindLabel(item.source)}</span>
      <Status value={item.status} />
      <h2 className={styles.title}>{item.title}</h2>
      <p className={styles.desc}>{item.description}</p>
      <footer className={styles.footer}>
        <span>Related context</span>
        <b>Open details →</b>
      </footer>
    </button>
  );
}
