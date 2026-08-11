import type { Insights } from "../domain/insights.js";

/**
 * Programme-level numbers, computed by the backend that owns the rows.
 *
 * A capability, not a convenience: a host that cannot answer this simply does not
 * offer it, and the dashboard is absent rather than showing an empty page of zeros.
 * See the note on `Insights` about why the shape is so insistent on nulls.
 */
export interface InsightsProvider {
  get(): Promise<Insights>;
}
