import type React from "react";
import styles from "./Status.module.scss";
import { requestStatusName, statusDisplayName } from "../../utils";
import type { Request, Solution } from "../../types";

export function Status({ value }: { value: Request["status"] | Solution["status"] | string }): React.ReactElement {
  const raw = requestStatusName(value);
  const display = statusDisplayName(raw);
  return <span className={`${styles.status} ${styles[`status${raw}`] ?? ""}`}>{display}</span>;
}
