import type React from "react";
import styles from "./Discovery.module.scss";
import type { DiscoveryItem } from "../../types";
import { ContextualEmpty } from "../../Components/Empty/Empty";
import { PageHeader } from "../../Components/PageHeader/PageHeader";
import { ResultCard } from "../../Components/ResultCard/ResultCard";

export interface DiscoveryProps {
  query: string;
  results: DiscoveryItem[];
  onOpen: (item: DiscoveryItem) => void;
  heading?: string;
}

export function Discovery({
  query,
  results,
  onOpen,
  heading,
}: DiscoveryProps): React.ReactElement {
  const pageTitle = heading || "Search Innovation Hub";

  return (
    <section>
      <PageHeader
        title={pageTitle}
        detail={`${results.length} matches`}
      />
      <p className={styles.pageIntro}>
        Find an idea, follow a solution, and uncover the connection that moves
        your work forward.
      </p>
      {results.length === 0 ? (
        <ContextualEmpty
          title={query ? "No strong matches yet." : "What are you looking for?"}
          text="Search from the home page to try a challenge, capability, team, or outcome."
        />
      ) : (
        <div className={styles.resultGrid}>
          {results.map((item) => (
            <ResultCard key={`${item.kind}-${item.itemId}`} item={item} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}
