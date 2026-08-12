# Provisioning the Innovation Backlog backing stores

Three scripts stand up everything the code app reads: an Azure DevOps inherited
process, the project that uses it, and the Dataverse schema for everything Azure
DevOps cannot hold.

Run them in order. Each one prints the values the next one needs.

```powershell
# 1. The process (organization-scoped)
$process = ./Provision-AdoProcess.ps1 -Organization contoso -Pat $env:AZDO_PAT

# 2. The project, on that process
$project = ./Provision-AdoProject.ps1 -Organization contoso -ProcessId $process.ProcessId -Pat $env:AZDO_PAT

# 3. Dataverse, fed the ids the ADO scripts emitted
Connect-AzAccount
./Provision-DataverseSchema.ps1 `
    -EnvironmentUrl https://contoso.crm.dynamics.com/ `
    -AdoOrgId $project.Organization `
    -AdoProjectId $project.ProjectId
```

All three are **idempotent**. Every `Ensure-*` helper reads before it writes and
reports `Exists` instead of failing, so re-running after a partial failure is safe
and is the intended recovery path.

---

## What each script creates

### `Provision-AdoProcess.ps1`

An inherited process named **Innovation Backlog**, based on **Basic**.

| Work item type | Backlog level | States |
|---|---|---|
| **Idea** | Epics (renamed) | Draft → Triage → Awaiting Approval → Accepted → Published; Rejected |
| **Backlog Item** | Issues (renamed) | inherited from Basic |
| **Solution** | none — a catalog entry is not work | Awaiting Approval → Published → Retired; Rejected |

Plus three organization-scoped picklists, the `Custom.*` fields, and four rules per
type (the approver gate on `System.State`, rationale-required on the decision
transitions, and the administrator gate on `Custom.Visibility`).

The inherited `Epic` and `Issue` types are **disabled**, not removed — an inherited
work item type cannot be deleted from a process.

### `Provision-AdoProject.ps1`

The project, three visibility area paths (`\Everyone`, `\Approvers`, `\Hidden`), the
`Approvers` group, and the area-path ACLs that make `ItemVisibility` a platform
guarantee rather than a client-side filter.

Pass `-SkipAreaPathSecurity` to create the paths but leave permissions inherited if
you want to review the ACL changes before applying them.

### `Provision-SkillsRepository.ps1`

The git repository skill intake commits into. Independent of the three backing-store
scripts.

```powershell
./Provision-SkillsRepository.ps1 -Organization contoso -Project "Innovation Backlog" `
    -Segments engineering,operations
```

Seeds `.claude-plugin/marketplace.json`, a README, and a `.gitattributes` that marks
binary types. **The manifest is not optional** — intake reads it before every commit and
refuses to invent one, so without this step the first adoption fails with *"the skills
repository is not initialised"*.

Layout it establishes:

```
plugins/{segment}/skills/{solutionId}__{name}/SKILL.md
```

`solutionId` is the GUID of the catalogue entry the skill was adopted from, and it is
**the entire link** between this repository and the backlog — no sidecar file, no lookup
table. The name after it keeps the repository readable. A double underscore separates
them, because a single one is legal inside a skill name and the split has to be
unambiguous.

The two never have to agree with anything else: discovery is driven by the `name` in
SKILL.md frontmatter, not by the directory, so the folder is free to carry the id.

**A rename is a move, not a copy.** Approving a skill under a corrected name writes to a
different folder, so intake deletes the solution's previous folder in the same commit.
Without that the marketplace would publish one solution twice under two names.

The PAT provisions the repository and is not used at runtime — intake commits as the
calling user, so each approver needs **Contribute** on it.

### `Provision-McpAppRegistration.ps1`

The Entra app registration the MCP server (`src/Momentum.Mcp`) authenticates callers
against. Independent of the three above — it touches the directory, not the backing
stores — so it can be run at any point.

```powershell
az login
./Provision-McpAppRegistration.ps1
# once the function app exists:
./Provision-McpAppRegistration.ps1 -ManagedIdentityPrincipalId <mi-object-id>
```

One registration doing three jobs: it is the **audience of the inbound token** (which
is never forwarded downstream), it **holds the delegated permissions** for Dataverse
and Azure DevOps so the server can exchange that token on the caller's behalf, and it
**names the MCP clients** allowed to ask for it.

That last one is not optional. Entra has no dynamic client registration, and some
clients — VS Code among them — never surface an interactive consent prompt, so an
unlisted client fails with a consent error that reads like a server bug. The script
preauthorizes VS Code and Visual Studio by default; add others with
`-PreauthorizedClientIds`.

The downstream scope ids are **looked up, not hardcoded**. A hardcoded GUID would turn
"the Dataverse service principal isn't in this tenant" into an opaque consent failure
much later; the lookup says so immediately and tells you the `az ad sp create` to run.

**Two steps it deliberately does not attempt**, both printed as follow-ups:

1. **Admin consent** on the two delegated permissions
   (`az ad app permission admin-consent --id <clientId>`). Until it is granted the
   on-behalf-of exchange fails for *everyone*, including whoever ran the script.
2. **Enabling App Service Authentication** on the function app. That is a change to
   the hosting resource, not the directory, and it is what actually makes the server
   demand a token — the `WEBSITE_AUTH_PRM_DEFAULT_WITH_SCOPES` setting only advertises
   the scope.

**On-behalf-of carries access; it does not grant it.** A caller with no Dataverse
security role, or no Azure DevOps project membership, still gets a 403 from that
backend after every step here succeeds. Use the `whoami` tool to tell the two apart —
it reports each backend separately, so a caller who reaches one and not the other
tells you precisely which grant is missing. A real example of its output:

```
azureDevOps  reachable: false  401 — VS403318: <user> has not accepted the invitation
                                to the Cyclotron Inc. organization.
dataverse    reachable: true   systemuserid c2c73a3d-...
```

### `Provision-DataverseSchema.ps1`

Publisher `cycai`, the unmanaged solution `InnovationBacklog`, seven global choices,
and seven tables:

| Table | Holds |
|---|---|
| `cycai_vote` | one upvote per person per target, **unique by alternate key** |
| `cycai_adoption` | a team putting a solution to use |
| `cycai_comment` | audience-scoped comments — see below |
| `cycai_participation` | requests to help, with their decision |
| `cycai_ideasolutionlink` | the idea↔solution claim, its relationship and approval |
| `cycai_activity` | the user-facing activity feed |
| `cycai_momentum` | the precomputed engagement rollup |

…then the three environment variables.

---

## Prerequisites

| Script | Needs |
|---|---|
| `Provision-AdoProcess.ps1` | PowerShell 7+. PAT with **Work Items (Manage)** at organization scope. |
| `Provision-AdoProject.ps1` | PowerShell 7+. PAT with **Project and Team (Manage)**, **Work Items (Manage)**, **Graph (Manage)**. |
| `Provision-DataverseSchema.ps1` | PowerShell 7+, `Az.Accounts`, `Connect-AzAccount`. System Customizer or System Administrator in the target environment. |
| `Provision-McpAppRegistration.ps1` | PowerShell 7+, Azure CLI, `az login`. Application Administrator (or Application Developer plus an admin for the consent step) in the tenant. |
| `Provision-SkillsRepository.ps1` | PowerShell 7+. PAT with **Code (Read, write, & manage)**. |

Both ADO scripts read `$env:AZDO_PAT` when `-Pat` is omitted.

---

## Why the schema is split the way it is

**Comments are in Dataverse, not Azure DevOps.** An ADO work item comment has exactly
one audience — anyone who can read the work item. Momentum's model has three
(`Authenticated`, `SubmitterAndApprovers`, `ApproversOnly`), and `ApproversOnly` is
where creation triage writes its findings. There is no way to express that on a work
item, so `cycai_comment` carries the audience and the connector's comment actions go
unused. Attachments hang off the native `annotation` table.

**`cycai_momentum` is required, not an optimisation.** Two independent reasons: the
ADO connector's `Get work item comments` is per-work-item with no batch form, so a
30-row list would spend 30 of the 300-calls-per-60-seconds budget; and FetchXML
aggregates cannot order by an aggregate value, so demand rank cannot be computed as a
live query.

**Links carry their data in Dataverse.** Inherited processes cannot define custom link
types and ADO links carry no attributes, so the relationship and its approval state
live in `cycai_ideasolutionlink`. The ADO `Related` link is a cosmetic one-way mirror.

**Failure states are fields, not states.** ADO has one `State` field and only one state
may occupy the `Completed` category, but `TriageFailed` / `PublicationFailed` /
`ProjectionFailed` are orthogonal to the lifecycle and must not roll it back. They
live in `Custom.PipelineStatus` and `Custom.PipelineError` so `State` stays honest and
the board does not lie.

---

## Things that are permanent

Fail-loud rather than silent divergence is deliberate; these cannot be renamed once
they exist:

- Azure DevOps work item type names, state names, and field names and types
- The Dataverse publisher prefix (`cycai`) and every schema name derived from it
- A process's parent process

If a script stops with a message like *"…is type 'string' but the definition says
'integer'"*, that is the guard working. Change the definition or delete the object.

---

## Known gaps and things to verify

**Accepted parity gap — owner visibility.** `ItemVisibility.Approvers` in the domain
means "approvers, administrators, **and the person who shared it**". Area-path ACLs
have no owner exception, so an author cannot see their own restricted idea. There is
no client-side workaround: the data never arrives.

**Verify on a throwaway organization before trusting a real one:**

1. **Field creation shape.** The 7.1 `Fields - Add` reference documents only
   `referenceName` / `defaultValue` / `allowGroups` / `allowedValues` / `readOnly` /
   `required` in the request body. `Ensure-Field` also sends `name` and `type` to
   create a field that does not exist yet, which is the form in common use but is not
   in the published contract.
2. **Picklist binding.** `Ensure-Field` sends a nested `pickList: { id }`; some API
   versions take a flat `pickListId`.
3. **Rule condition and action types.** The approver gate uses
   `$whenCurrentUserIsNotMemberOfGroup` + `$makeReadOnly`. Confirm a non-approver
   genuinely cannot change `System.State`.
4. **Alternate key indexing.** `Ensure-AlternateKey` polls until
   `EntityKeyIndexStatus` is `Active`. Until it is, the key enforces nothing. Confirm
   a duplicate `(target key, voter)` insert is rejected.

**Side effect of the approver gate:** making `System.State` read-only for non-approvers
also stops a submitter moving their own idea from `Draft` to `Triage`. That transition
is driven by the app or a Flow, not by the user.

---

## After provisioning

Register the tables in the code app — only the ones it actually needs, since
`getClient` is a singleton and the first registry wins:

```powershell
pac code add-data-source -a dataverse -t cycai_vote
pac code add-data-source -a dataverse -t cycai_adoption
pac code add-data-source -a dataverse -t cycai_comment
pac code add-data-source -a dataverse -t cycai_participation
pac code add-data-source -a dataverse -t cycai_ideasolutionlink
pac code add-data-source -a dataverse -t cycai_activity
pac code add-data-source -a dataverse -t cycai_momentum

# Native tables the runtime needs
pac code add-data-source -a dataverse -t systemuser
pac code add-data-source -a dataverse -t annotation
pac code add-data-source -a dataverse -t environmentvariabledefinition
pac code add-data-source -a dataverse -t environmentvariablevalue
```

`Provision-DataverseSchema.ps1` prints the assigned choice values at the end. Copy
them into the provider's choice registry — Dataverse allocates option values inside
the publisher's prefix range, so they are stable per publisher but not knowable in
advance.
