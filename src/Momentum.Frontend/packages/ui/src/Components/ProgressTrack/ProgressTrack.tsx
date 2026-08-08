import type React from "react";
import styles from "./ProgressTrack.module.scss";

export function ProgressTrack({
  stage,
}: {
  stage: "shaping" | "review" | "shared";
}): React.ReactElement {
  const activeStep = stage === "shaping" ? 2 : stage === "review" ? 3 : 4;
  return (
    <div className={styles.track} aria-label={`Progress: ${stage}`}>
      {["Need", "Exploring", "Shaping", "Review", "Shared"].map((label, index) => (
        <span className={index <= activeStep ? styles.complete : ""} key={label}>
          {label}
        </span>
      ))}
    </div>
  );
}
