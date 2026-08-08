import { AppError } from "@innovation-backlog/logic";
import type { EnvironmentProvider } from "@innovation-backlog/logic";
import { TABLES } from "./registry.js";

/**
 * Runtime configuration, read from Dataverse environment variables.
 *
 * A code app ships as one static bundle promoted dev -> test -> prod, so anything
 * environment-specific has to be read at runtime; `import.meta.env` would bake one
 * environment into the artifact.
 *
 * Resolution is: value row -> definition default -> unset. A variable with no value
 * row is normal, not an error.
 */

const SCHEMA_NAMES = {
  adoOrganization: "cycai_InnovationBacklogAdoOrgId",
  adoProject: "cycai_InnovationBacklogAdoProjectId",
  designation: "cycai_InnovationBacklogEnvDesignation",
} as const;

export type EnvVarKey = keyof typeof SCHEMA_NAMES;
export type EnvVars = Record<EnvVarKey, string | null>;

const EMPTY: EnvVars = { adoOrganization: null, adoProject: null, designation: null };

interface DefinitionRow {
  environmentvariabledefinitionid: string;
  schemaname: string;
  defaultvalue?: string | null;
}

interface ValueRow {
  _environmentvariabledefinitionid_value?: string;
  value?: string | null;
}

interface MinimalClient {
  retrieveMultipleRecordsAsync<T>(
    dataSource: string,
    options?: { select?: string[]; filter?: string; top?: number },
  ): Promise<{ success: boolean; data: T[]; error?: Error }>;
}

/**
 * Two requests total, memoized for the life of the provider — these values are
 * fixed per environment, and the ADO adapter asks for them on every call.
 *
 * Never throws. A read failure is indistinguishable from a variable deliberately
 * left blank, and both mean "the dependent behaviour is off".
 */
export function createEnvironmentReader(client: MinimalClient): {
  read: () => Promise<EnvVars>;
  provider: EnvironmentProvider;
} {
  let pending: Promise<EnvVars> | null = null;

  async function load(): Promise<EnvVars> {
    try {
      const wanted = Object.values(SCHEMA_NAMES);
      const definitions = await client.retrieveMultipleRecordsAsync<DefinitionRow>(
        TABLES.environmentVariableDefinitions,
        {
          select: ["environmentvariabledefinitionid", "schemaname", "defaultvalue"],
          filter: wanted.map((name) => `schemaname eq '${name}'`).join(" or "),
          top: wanted.length,
        },
      );
      if (!definitions.success || definitions.data.length === 0) return EMPTY;

      const values = await client.retrieveMultipleRecordsAsync<ValueRow>(
        TABLES.environmentVariableValues,
        {
          select: ["_environmentvariabledefinitionid_value", "value"],
          filter: definitions.data
            .map((d) => `_environmentvariabledefinitionid_value eq ${d.environmentvariabledefinitionid}`)
            .join(" or "),
          top: definitions.data.length,
        },
      );

      const overrides = new Map<string, string | null | undefined>();
      if (values.success) {
        for (const row of values.data) {
          if (row._environmentvariabledefinitionid_value) {
            overrides.set(row._environmentvariabledefinitionid_value, row.value);
          }
        }
      }

      const resolve = (schemaName: string): string | null => {
        const definition = definitions.data.find((d) => d.schemaname === schemaName);
        if (!definition) return null;
        const raw =
          overrides.get(definition.environmentvariabledefinitionid) ??
          definition.defaultvalue ??
          "";
        return raw.trim() || null; // blank means unset — that is how prod hides the banner
      };

      return {
        adoOrganization: resolve(SCHEMA_NAMES.adoOrganization),
        adoProject: resolve(SCHEMA_NAMES.adoProject),
        designation: resolve(SCHEMA_NAMES.designation),
      };
    } catch {
      return EMPTY;
    }
  }

  const read = () => (pending ??= load());

  return {
    read,
    provider: {
      async getDesignation() {
        return (await read()).designation;
      },
    },
  };
}

/**
 * The Azure DevOps organization and project, or a classified error explaining that
 * they are unset.
 *
 * This is why the environment read is memoized rather than awaited once at startup:
 * `createProvider()` has to run synchronously at module scope, but the ADO base URL
 * is only knowable after an async Dataverse read. Every ADO call awaits this
 * instead, so the factory stays synchronous.
 */
export async function requireAdoContext(
  read: () => Promise<EnvVars>,
): Promise<{ organization: string; project: string }> {
  const vars = await read();
  if (!vars.adoOrganization || !vars.adoProject) {
    throw new AppError(
      "Azure DevOps is not configured: set the InnovationBacklog_ADO_OrgId and InnovationBacklog_ADO_ProjectId environment variables.",
      { category: "notFound", userMessage: "Azure DevOps isn't configured for this environment yet." },
    );
  }
  return { organization: vars.adoOrganization, project: vars.adoProject };
}
