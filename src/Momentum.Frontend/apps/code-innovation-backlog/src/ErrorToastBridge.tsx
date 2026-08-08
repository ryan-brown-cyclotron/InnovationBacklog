import React, { useEffect, useState } from "react";
import { subscribeToErrors } from "@innovation-backlog/logic";
import type { AppError } from "@innovation-backlog/logic";

interface Notice {
  id: number;
  message: string;
  severity: AppError["severity"];
}

/**
 * Turns errors published on the bus into visible notices.
 *
 * The bus exists so an adapter can report a failure it recovered from — a reference
 * table it could not read, so display names stayed unresolved — without knowing that
 * a notification surface exists. A list that renders half-populated is otherwise
 * indistinguishable from one with no data.
 *
 * Deliberately plain: swap the rendering for the design system's toast once
 * @momentum/ui is reshaped. The subscription contract does not change.
 */
export function ErrorToastBridge(): React.ReactElement | null {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    let nextId = 0;
    return subscribeToErrors((error) => {
      const notice: Notice = { id: nextId++, message: error.userMessage, severity: error.severity };
      setNotices((current) => [...current, notice]);
      // Warnings are recoverable and self-clear; errors stay until dismissed.
      if (notice.severity !== "error") {
        setTimeout(() => {
          setNotices((current) => current.filter((n) => n.id !== notice.id));
        }, 6000);
      }
    });
  }, []);

  if (notices.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1000, display: "grid", gap: 8 }}
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            maxWidth: 380,
            font: "14px/1.4 system-ui, sans-serif",
            color: "#fff",
            background: notice.severity === "error" ? "#a4262c" : "#8a6d1f",
          }}
        >
          {notice.message}
          <button
            type="button"
            onClick={() => setNotices((c) => c.filter((n) => n.id !== notice.id))}
            aria-label="Dismiss"
            style={{
              marginLeft: 12,
              background: "transparent",
              border: 0,
              color: "inherit",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
