/**
 * Runtime configuration that differs per environment.
 *
 * A code app ships as one static bundle promoted dev -> test -> prod, so build-time
 * configuration would bake one environment into the artifact. These values are read
 * at runtime instead — from Dataverse environment variables in the code app, and
 * not at all in the in-memory provider, which is why the whole capability is
 * optional on the composed provider.
 *
 * Every method resolves to null rather than throwing. A value that cannot be read
 * is indistinguishable from one that was deliberately left blank, and both mean
 * "the dependent UI hides itself".
 */
export interface EnvironmentProvider {
  /** Non-production banner label. Null in production, where the variable is blank. */
  getDesignation(): Promise<string | null>;
}
