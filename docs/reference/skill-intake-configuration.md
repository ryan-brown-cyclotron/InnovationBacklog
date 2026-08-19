# Skill intake: function app configuration

Everything the function app needs to reach the skills git repository. `local.settings.json` is
gitignored, so this is the tracked copy.

Three endpoints, all `POST`, all `AuthorizationLevel.Function`:

| Route | Talks to git | Needs a credential |
|---|---|---|
| `skills/validate` | no | no |
| `skills/commit` | yes | yes |
| `skills/provision` | yes | yes |

`skills/validate` is pure computation over the uploaded bytes — no repository, no Dataverse, no
credential. It works before anything below is configured, which is the point: a contributor gets an
answer about their package whether or not the commit path is wired.

## The section

Bound to `SkillsOptions` and validated on start, so a half-filled section stops the host instead of
surfacing as a 404 or a sign-in redirect on someone's first adoption.

| Setting | Default | Notes |
|---|---|---|
| `Momentum:Skills:Host` | `AzureDevOps` | `AzureDevOps` or `GitHub` |
| `Momentum:Skills:Auth` | `Caller` | `Caller` or `Pat` — see below |
| `Momentum:Skills:Pat` | — | Required when `Auth=Pat`. Key Vault reference in a deployed app |
| `Momentum:Skills:Branch` | `main` | Used when a request body does not name one |
| `Momentum:Skills:MarketplaceName` | `momentum` | Goes in a freshly seeded `marketplace.json` |
| `Momentum:Skills:MarketplaceDescription` | Skills adopted from the Innovation Backlog. | Same |
| `Momentum:Skills:AllowRepositoryCreate` | `true` | Whether `skills/provision` may create the repository |
| `Momentum:Skills:AzureDevOps:Organization` | falls back to `Momentum:Mcp:AdoOrganization` | Name, not a URL |
| `Momentum:Skills:AzureDevOps:Project` | falls back to `Momentum:Mcp:AdoProject` | |
| `Momentum:Skills:AzureDevOps:Repository` | `skills` | A **name**. A GUID works for reads and commits but cannot be provisioned |
| `Momentum:Skills:GitHub:Owner` | — | Required on GitHub. Organization or user |
| `Momentum:Skills:GitHub:Repository` | `skills` | |
| `Momentum:Skills:GitHub:ApiRoot` | `https://api.github.com/` | GHES is `https://ghe.example.com/api/v3/` — keep the trailing slash |
| `Momentum:Skills:GitHub:CreatePrivate` | `true` | Visibility for a repository this app creates |

**Key naming.** Colons in `local.settings.json` under `Values`; double underscores as Azure app
settings — `Momentum__Skills__AzureDevOps__Repository` — because a colon is not legal in an
environment variable name on Linux.

**Host and auth are read at startup**, not per request: they decide which adapter and which HTTP
handler get registered. Changing either is a restart.

The two `AzureDevOps` fallbacks exist because the skills repository usually does sit beside the
backlog. Making people repeat the organization to say so is a setting that only ever gets out of
step.

## Auth

### `Caller` — Azure DevOps only

Commits as the person who called the endpoint: their inbound token is exchanged for an Azure DevOps
token (`Momentum:Mcp:AuthMode=Obo`), or the signed-in Azure CLI user's is borrowed
(`AuthMode=DevCli`, refused outside Development).

The stronger option where it applies. Azure DevOps records who actually wrote each commit, and every
approver needs **Contribute** on the repository in their own right.

Not available on GitHub, and rejected at startup rather than quietly downgraded: on-behalf-of
exchange produces Entra tokens, and GitHub does not accept them.

### `Pat` — either host

Commits as one service credential.

- **Azure DevOps**: a PAT with **Code (Read, write & manage)**. Sent as HTTP basic auth with an
  empty username, which is the format Azure DevOps expects — as a bearer token it answers with a
  *redirect to a sign-in page* rather than a 401, so the failure arrives looking like a
  configuration problem somewhere else entirely.
- **GitHub**: classic PAT with `repo`, or a fine-grained PAT with **Contents: read and write** (plus
  **Administration: write** if `skills/provision` should be able to create the repository). Sent as
  a bearer token. A fine-grained token must also list this repository in its scope. Nothing inspects
  the string, so a GitHub App installation token works too.

What you give up: every commit is attributed to whoever owns the token, and repository permissions
stop being a per-approver control. What survives is the audit trail in the commit message —
`Approved-by` is written from the request body, which is exactly why that field exists and is not
inferred from the credential.

## Provisioning

`POST skills/provision`, empty body allowed:

```json
{ "branch": "main", "segments": ["engineering", "operations"] }
```

Creates the repository if it is missing and seeds `.claude-plugin/marketplace.json`, `README.md` and
`.gitattributes` if they are missing. Idempotent — safe on every deployment, and the intended
recovery path after a partial failure. A `200` with a null `commitId` means the repository was
already fine.

It **seeds only what is absent**. An existing manifest is left exactly as it is, even if the request
names segments it does not contain: registering a segment is intake's job on first use, and
rewriting a file someone may have hand-tuned is not bootstrap.

This replaces `scripts/provisioning/Provision-SkillsRepository.ps1` as the normal route. The script
still works and still does the same thing; it needs a PAT in a shell and someone remembering to run
it, which is what made bootstrap a prerequisite people forgot. It also seeds the manifest through
`ConvertTo-Json`, whose whitespace differs from the endpoint's — the first commit after it will
reformat the file once.

The response echoes the resolved target and auth mode, never the token:

```json
{
  "target": "GitHub cyclotron/skills",
  "host": "GitHub",
  "auth": "Pat",
  "branch": "main",
  "repositoryCreated": false,
  "wasInitialised": true,
  "commitId": null,
  "seededPaths": []
}
```

`target` is echoed because a wrong target is the failure that looks like a permissions problem —
this is how you find out you provisioned the wrong repository successfully.

## GitHub

A second `ISkillRepository` adapter and nothing else. Every rule about where a skill lands, what the
folder name means, and what a rename at approval does lives in `SkillIntakeService` and is shared
between hosts.

Two differences worth knowing:

- **A commit is four calls, not one.** Azure DevOps has a push endpoint that takes a whole
  multi-file changeset. GitHub does not, and its Contents API writes one file per commit — which
  would turn a forty-file skill into forty commits. The adapter uses the low-level Git Data API
  instead: build a tree on top of the current one, make a commit pointing at it, move the ref. That
  is also the only route that can express a delete, which a rename at approval requires. Text files
  go inline in the tree call, so an all-markdown skill is still a single request; binaries need a
  blob upload each.
- **Listing reads the whole tree.** Scoping GitHub's tree endpoint to a subfolder means
  percent-encoding a `branch:nested/path` tree-ish into a single path segment, which is a coin toss
  through anything sitting in front of a GHES install. A skills repository is small enough that
  reading the whole tree is the cheaper mistake. A truncated listing is a hard failure, not a
  partial answer: intake decides what to *delete* from that listing, so a short list means a stale
  folder survives and the marketplace publishes one solution twice under two names.

Concurrency is equivalent on both hosts. The commit's parent is the tip that was read at the start,
so a concurrent intake makes the ref move a non-fast-forward and `force: false` makes GitHub refuse
it — the same guarantee `oldObjectId` gives on Azure DevOps, and the same cue for
`SkillIntakeService` to re-read and retry.

## Startup failures

All from `SkillsOptionsValidator`, all naming the setting key rather than the field:

- `Momentum:Skills:Auth=Caller is not available for GitHub` — set `Auth=Pat`.
- `Momentum:Skills:Auth is Pat but Momentum:Skills:Pat is empty`.
- `Momentum:Skills:AzureDevOps:Organization is required when no Momentum:Mcp:AdoOrganization is
  configured to fall back to` — likewise `Project`.
- `Momentum:Skills:GitHub:ApiRoot must end with a slash` — `HttpClient` drops the last segment of a
  base address without one, which on GHES silently strips `/api/v3` and sends every call to the web
  app, where it is answered with HTML rather than an error.
