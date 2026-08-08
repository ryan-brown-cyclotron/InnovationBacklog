/**
 * Data source aliases, as registered in power.config.json.
 *
 * These are the strings the SDK addresses tables by, and they are NOT entity set
 * names — `pac code add-data-source` derives a short alias from the table's display
 * name, so `cycai_participation` is reachable as `participationrequests` and
 * `systemuser` as `users`. A wrong one fails at runtime with "Unable to find data
 * source: <name> in data sources info", so they live here once.
 *
 * The generated services already hard-code the correct alias, so most code never
 * needs this. It matters for anything addressing the client directly — the
 * environment-variable reader, and any pseudo data source.
 *
 * Authority: the filenames under .power/schemas/dataverse/.
 *
 * Choice values are deliberately NOT here. The generated models carry them
 * (`Cycai_votescycai_targettype` and friends), and a second copy would be a second
 * thing to keep in step with the environment for no benefit.
 */
export const TABLES = {
  votes: "votes",
  adoptions: "adoptions",
  comments: "comments",
  participation: "participationrequests",
  activity: "activity",
  momentum: "momentum",
  users: "users",
  notes: "notes",
  environmentVariableDefinitions: "environmentvariabledefinitions",
  environmentVariableValues: "environmentvariablevalues",
} as const;

export type TableAlias = (typeof TABLES)[keyof typeof TABLES];
