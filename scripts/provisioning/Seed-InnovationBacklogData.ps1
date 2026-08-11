#Requires -Version 7.0
<#
.SYNOPSIS
    Clears and reseeds the Innovation Backlog demo data.
.DESCRIPTION
    Two halves that run independently:

      ADO         Idea and Solution work items, their states, tags, hyperlinks,
                  Related links and comments.
      Dataverse   Votes, adoptions, participation and the activity feed.

    Run both (the default), or one at a time with -SkipDataverse / -SkipAdo. The
    Dataverse half needs the work item ids, which it resolves from Azure DevOps by
    title, so it needs the PAT too even when -SkipAdo is set.

    DELETING A WORK ITEM ORPHANS ITS DATAVERSE ROWS. Nothing cleans them up, so
    -Reset clears both stores or neither. Work items go to the Recycle Bin rather
    than being purged: a soft delete keeps the id, so restoring reattaches the
    engagement rows. Pass -Purge to destroy them instead.

    SINGLE ACTOR BY DESIGN. Everything is created as the PAT / token identity. The
    vote table has an Active alternate key over (targetkey, voterid), so one identity
    means at most ONE vote per item and upvote counts of 0 or 1. Adoptions and
    comments carry no such constraint, which is where the seeded variety comes from.
    Seeding other people's names into fabricated records was declined deliberately.

    Idempotent in the sense that matters here: -Reset makes the target empty first.
    Without -Reset the seed appends, and rerunning will duplicate.
.PARAMETER Organization
    Azure DevOps organization name.
.PARAMETER ProjectName
    Azure DevOps project. Must match cycai_InnovationBacklogAdoProjectId in the
    Dataverse environment, or the app will read a different project than you seeded.
.PARAMETER EnvironmentUrl
    Dataverse environment URL.
.PARAMETER Pat
    ADO personal access token with Work Items (Read, write, & manage). Defaults to
    $env:AZDO_PAT.
.PARAMETER AccessToken
    A Dataverse bearer token. Omit it and the script finds one itself, preferring the
    Azure CLI and falling back to Az PowerShell.
.PARAMETER Reset
    Delete existing work items and all cycai_* engagement rows before seeding.
.PARAMETER Purge
    With -Reset, destroy work items instead of sending them to the Recycle Bin.
.EXAMPLE
    $env:AZDO_PAT = '...'
    az login    # once, if not already signed in
    .\Seed-InnovationBacklogData.ps1 -Reset
#>
param(
    [string]$Organization = "CyclotronInc",

    [string]$ProjectName = "InnovationBacklogDev",

    [string]$EnvironmentUrl = "https://org9ceb01a6.crm.dynamics.com",

    [string]$Pat = $env:AZDO_PAT,

    [string]$AccessToken,

    [switch]$Reset,

    [switch]$Purge,

    [switch]$SkipAdo,

    [switch]$SkipDataverse
)

$ErrorActionPreference = "Stop"

$script:ApiVersion = "7.1"
$script:ProjectUrl = "https://dev.azure.com/$Organization/$ProjectName/_apis"
$script:Resource = $EnvironmentUrl.TrimEnd("/")
$script:ApiRoot = "$script:Resource/api/data/v9.2"

function Write-Created { param([string]$Message) Write-Host "  Created $Message" -ForegroundColor Green }
function Write-Exists { param([string]$Message) Write-Host "  Exists  $Message" -ForegroundColor DarkGray }
function Write-Removed { param([string]$Message) Write-Host "  Removed $Message" -ForegroundColor DarkYellow }
function Write-Step { param([string]$Message) Write-Host "`n$Message" -ForegroundColor Cyan }

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

if ([string]::IsNullOrWhiteSpace($Pat)) {
    throw "No personal access token. Pass -Pat or set `$env:AZDO_PAT. The Dataverse half needs it too, to resolve work item ids."
}
$script:AuthHeader = @{
    Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$Pat"))
}

<#
    Same three sources, same order, as Provision-DataverseSchema.ps1. Scoped to the
    environment URL itself — Dataverse is its own resource, not ARM.
#>
function Get-DataverseToken {
    param([Parameter(Mandatory = $true)][string]$Resource)

    if (Get-Command az -ErrorAction SilentlyContinue) {
        $token = az account get-access-token --resource $Resource --query accessToken -o tsv 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($token)) {
            $account = (az account show --query user.name -o tsv 2>$null)
            Write-Host "Authenticated to Dataverse via Azure CLI as $account" -ForegroundColor DarkGray
            return $token.Trim()
        }
    }

    if (Get-Module -ListAvailable -Name Az.Accounts) {
        Import-Module Az.Accounts -ErrorAction Stop
        if (Get-AzContext) {
            $result = Get-AzAccessToken -ResourceUrl $Resource
            $value = if ($result.Token -is [System.Security.SecureString]) {
                [System.Net.NetworkCredential]::new("", $result.Token).Password
            }
            else { $result.Token }
            Write-Host "Authenticated to Dataverse via Az PowerShell" -ForegroundColor DarkGray
            return $value
        }
    }

    throw "No Dataverse credential. Run 'az login', or 'Connect-AzAccount', or pass -AccessToken."
}

if (-not $SkipDataverse.IsPresent) {
    $script:AccessToken = if ($AccessToken) { $AccessToken } else { Get-DataverseToken -Resource $script:Resource }
}

# ---------------------------------------------------------------------------
# REST plumbing
# ---------------------------------------------------------------------------

function Invoke-Ado {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Uri,
        [object]$Body,
        [string]$Version = $script:ApiVersion,
        [string]$ContentType = "application/json",
        [switch]$AllowNotFound
    )

    $separator = if ($Uri.Contains("?")) { "&" } else { "?" }
    $full = "$Uri$separator" + "api-version=$Version"

    $params = @{
        Method      = $Method
        Uri         = $full
        Headers     = $script:AuthHeader
        ContentType = $ContentType
    }
    if ($null -ne $Body) {
        # -Depth 10 covers relation attributes; -AsArray keeps a one-operation JSON
        # Patch document an array, which PowerShell would otherwise unwrap to an
        # object and ADO would reject as a malformed patch.
        $json = if ($Body -is [System.Collections.IList]) {
            $Body | ConvertTo-Json -Depth 10 -AsArray
        }
        else { $Body | ConvertTo-Json -Depth 10 }
        $params.Body = [Text.Encoding]::UTF8.GetBytes($json)
    }

    try {
        return Invoke-RestMethod @params
    }
    catch {
        $response = $_.Exception.Response
        $status = if ($response) { [int]$response.StatusCode } else { 0 }
        if ($status -eq 404 -and $AllowNotFound.IsPresent) { return $null }

        $detail = ""
        try { $detail = ($_.ErrorDetails.Message | ConvertFrom-Json).message } catch { }
        if ([string]::IsNullOrWhiteSpace($detail)) {
            try { $detail = $_.ErrorDetails.Message } catch { $detail = $_.Exception.Message }
        }
        throw "$Method $full failed ($status): $detail"
    }
}

<#
    Hoist "@odata.type" to the front of every object, recursively. PowerShell
    hashtables are unordered and OData needs the discriminator first; see the
    identical note in Provision-DataverseSchema.ps1.
#>
function ConvertTo-ODataOrdered {
    param([Parameter(Mandatory = $true)]$Value)

    if ($Value -is [System.Collections.IDictionary]) {
        $result = [ordered]@{}
        if ($Value.Contains("@odata.type")) { $result["@odata.type"] = $Value["@odata.type"] }
        foreach ($key in $Value.Keys) {
            if ($key -eq "@odata.type") { continue }
            $result[$key] = ConvertTo-ODataOrdered -Value $Value[$key]
        }
        return $result
    }
    if ($Value -is [string]) { return $Value }
    if ($Value -is [System.Collections.IEnumerable]) {
        # The leading comma matters: PowerShell unwraps a single-element array on return.
        return , @($Value | ForEach-Object { ConvertTo-ODataOrdered -Value $_ })
    }
    return $Value
}

function Invoke-Dataverse {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body,
        [switch]$AllowNotFound,
        [switch]$ReturnRecord
    )

    $headers = @{
        Authorization      = "Bearer $script:AccessToken"
        Accept             = "application/json"
        "OData-Version"    = "4.0"
        "OData-MaxVersion" = "4.0"
    }
    if ($ReturnRecord.IsPresent) { $headers["Prefer"] = "return=representation" }

    $params = @{
        Method      = $Method
        Uri         = "$script:ApiRoot/$Path"
        Headers     = $headers
        ContentType = "application/json; charset=utf-8"
    }
    if ($null -ne $Body) {
        $ordered = ConvertTo-ODataOrdered -Value $Body
        $params.Body = [Text.Encoding]::UTF8.GetBytes(($ordered | ConvertTo-Json -Depth 20))
    }

    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try { return Invoke-RestMethod @params }
        catch {
            $response = $_.Exception.Response
            $status = if ($response) { [int]$response.StatusCode } else { 0 }
            if ($status -eq 404 -and $AllowNotFound.IsPresent) { return $null }

            # Service protection limits: 6000 requests / 5 min / user.
            if ($status -eq 429 -and $attempt -lt 4) {
                $retryAfter = 10
                try {
                    $values = $response.Headers.GetValues("Retry-After")
                    if ($values -and $values[0] -as [int]) { $retryAfter = [int]$values[0] }
                }
                catch { }
                Write-Host "  Throttled by Dataverse; waiting $retryAfter s" -ForegroundColor DarkYellow
                Start-Sleep -Seconds $retryAfter
                continue
            }

            $detail = ""
            try { $detail = ($_.ErrorDetails.Message | ConvertFrom-Json).error.message } catch { }
            if ([string]::IsNullOrWhiteSpace($detail)) {
                try { $detail = $_.ErrorDetails.Message } catch { $detail = $_.Exception.Message }
            }
            throw "$Method $Path failed ($status): $detail"
        }
    }
}

# ---------------------------------------------------------------------------
# Field and state vocabulary — mirrors provider/ado/workitems.ts
# ---------------------------------------------------------------------------

$FIELD = @{
    Title             = "System.Title"
    Description       = "System.Description"
    State             = "System.State"
    Tags              = "System.Tags"
    AreaPath          = "System.AreaPath"
    SolutionType      = "Custom.InnovationBacklogSolutionType"
    DecisionRationale = "Custom.InnovationBacklogDecisionRationale"
}
$RELATED = "System.LinkTypes.Related"
# Told apart by their link comment, exactly as toSolution() reads them back.
$LINK = @{ Repository = "Repository"; Demo = "Demo"; Canonical = "canonical" }

# ---------------------------------------------------------------------------
# The seed set
# ---------------------------------------------------------------------------

<#
    Content is Cyclotron's own domain: AI and Low Code consulting. Shaped to exercise
    every surface rather than the happy path —

      * ideas in Draft / Awaiting Approval / Accepted / Rejected
      * solutions of BOTH kinds, Strategy (demo only) and CustomSolution (repo + demo)
      * a solution left in Awaiting Approval, to prove the catalogue hides it from
        everyone but its author
      * ideas with no linked solution, which is what "Where you can contribute" shows
      * one idea with a canonical solution chosen, and one with a plain Related link
#>

$Ideas = @(
    @{
        Key         = "rfp-agent"
        Title       = "Copilot Studio agent that drafts first-pass RFP responses"
        Description = "Every RFP restates the same capability narrative and we rewrite it by hand each time. An agent grounded on past responses, case studies and the capability deck could produce a first draft in minutes, leaving the team to do the differentiating work."
        Tags        = @("copilot", "agents", "presales", "accelerator")
        State       = "Accepted"
        Rationale   = "Clear reuse across every pursuit, and the grounding corpus already exists in SharePoint."
        Area        = "Everyone"
        Comments    = @(
            "We have three years of responses in the Pursuits library. That is the corpus.",
            "Worth scoping the evaluation harness up front so we can prove the drafts are usable rather than just fast."
        )
    },
    @{
        Key         = "alm-standard"
        Title       = "Standardize Power Platform ALM across client engagements"
        Description = "Each engagement invents its own solution layering, branching and pipeline conventions, so nobody can move between projects without relearning. A documented standard plus a reference pipeline would make delivery portable."
        Tags        = @("power-platform", "alm", "governance", "delivery")
        State       = "Accepted"
        Rationale   = "Portability between engagements is the single biggest source of ramp-up cost."
        Area        = "Everyone"
        Comments    = @("This should cover managed vs unmanaged in the client's tenant, which is where most of the arguments happen.")
    },
    @{
        Key         = "rag-sharepoint"
        Title       = "RAG accelerator over client SharePoint content"
        Description = "Most Azure AI engagements start by rebuilding the same retrieval pipeline against SharePoint. An accelerator with indexing, chunking, permission trimming and an evaluation set would take weeks out of the front of those projects."
        Tags        = @("azure-ai", "rag", "sharepoint", "accelerator")
        State       = "Accepted"
        Rationale   = "Three engagements this year built the same thing independently."
        Area        = "Everyone"
        Comments    = @("Permission trimming is the part everyone underestimates. It should be in the accelerator, not an exercise for the reader.")
    },
    @{
        Key         = "doc-intelligence"
        Title       = "Document intelligence pipeline for invoice and contract extraction"
        Description = "Clients keep asking for structured data out of invoices, statements of work and contracts. We solve it bespoke every time. A pipeline with a model-per-document-type registry and a human-in-the-loop review queue would be reusable across industries."
        Tags        = @("document-intelligence", "azure-ai", "automation")
        State       = "Awaiting Approval"
        Area        = "Everyone"
        Comments    = @("Adjacent to the RAG accelerator but genuinely different: extraction with a confidence gate, not retrieval.")
    },
    @{
        Key         = "copilot-readiness"
        Title       = "One-day Copilot readiness assessment we can run for any client"
        Description = "Prospects ask what it takes to be ready for Copilot and we answer differently every time. A fixed one-day assessment with a scored output and a standard readout deck would turn a vague conversation into a repeatable engagement."
        Tags        = @("copilot", "presales", "assessment", "m365")
        State       = "Awaiting Approval"
        Area        = "Everyone"
        Comments    = @()
    },
    @{
        Key         = "prompt-library"
        Title       = "Shared prompt library with an evaluation harness"
        Description = "Prompts live in people's notebooks and in solution repos, so the good ones do not travel and nobody can tell whether a change made things better. A shared library with versioned prompts and a regression set would fix both."
        Tags        = @("ai-engineering", "prompts", "evaluation")
        State       = "Draft"
        Area        = "Everyone"
        Comments    = @()
    },
    @{
        Key         = "embedded-analytics"
        Title       = "Power BI embedded starter for client analytics portals"
        Description = "Embedding Power BI into a client-facing portal means row-level security, capacity sizing and token brokering every time. A starter that has already made those decisions would remove the riskiest week of the project."
        Tags        = @("power-bi", "embedded", "accelerator")
        State       = "Draft"
        Area        = "Everyone"
        Comments    = @()
    },
    @{
        Key         = "auto-provision-envs"
        Title       = "Auto-provision Dataverse dev/test/prod for every new engagement"
        Description = "Spinning up three environments, a publisher, a solution and the security roles is a day of clicking at the start of each project."
        Tags        = @("dataverse", "automation", "coe")
        State       = "Rejected"
        Rationale   = "Superseded by the ALM standard, which covers environment provisioning as one of its pipeline stages. Keeping both would split the audience."
        Area        = "Everyone"
        Comments    = @()
    }
)

$Solutions = @(
    @{
        Key          = "rfp-agent-solution"
        Title        = "RFP Response Agent (Copilot Studio)"
        Description  = "A Copilot Studio agent grounded on the Pursuits library that drafts a first-pass RFP response section by section, with citations back to the source response. Includes the topic design, the knowledge source configuration, and an evaluation set of twenty scored prompts."
        Tags         = @("copilot", "agents", "presales", "accelerator")
        Type         = "CustomSolution"
        State        = "Published"
        Rationale    = "Reviewed against the evaluation set; draft quality is good enough to edit rather than rewrite."
        Repository   = "https://github.com/cyclotron/rfp-response-agent"
        Demo         = "https://demo.cyclotron.com/rfp-response-agent"
        Area         = "Everyone"
        LinkedIdea   = "rfp-agent"
        Canonical    = $true
        Comments     = @(
            "Deployed into the Playground environment if you want to try it before adopting.",
            "The knowledge source config assumes the Pursuits library structure. Swap the site id and it works on any tenant."
        )
    },
    @{
        Key          = "alm-playbook"
        Title        = "Power Platform ALM Playbook"
        Description  = "The standard: solution layering, branching model, environment strategy, and a reference Azure DevOps pipeline for managed solution promotion. Written as a decision record so an engagement can deviate deliberately rather than by accident."
        Tags         = @("power-platform", "alm", "governance", "delivery")
        Type         = "Strategy"
        State        = "Published"
        Rationale    = "Adopted as the delivery default after review with the Power Platform practice."
        Demo         = "https://cyclotron.sharepoint.com/sites/practice/alm-playbook"
        Area         = "Everyone"
        LinkedIdea   = "alm-standard"
        Canonical    = $true
        Comments     = @("The pipeline yaml is in the appendix; it is deliberately not a repo so engagements copy rather than fork it.")
    },
    @{
        Key          = "rag-accelerator"
        Title        = "Cyclotron RAG Accelerator (Azure AI Search + Foundry)"
        Description  = "Indexing, chunking, permission-trimmed retrieval and an evaluation harness over SharePoint and Azure Blob sources. Ships with bicep for the search service, the ingestion function, and a golden question set for regression testing retrieval quality."
        Tags         = @("azure-ai", "rag", "sharepoint", "accelerator", "bicep")
        Type         = "CustomSolution"
        State        = "Published"
        Rationale    = "Permission trimming verified against a client tenant; retrieval quality benchmarked on the golden set."
        Repository   = "https://github.com/cyclotron/rag-accelerator"
        Demo         = "https://demo.cyclotron.com/rag-accelerator"
        Area         = "Everyone"
        LinkedIdea   = "rag-sharepoint"
        Canonical    = $false
        Comments     = @(
            "Two engagements are on this now. Raise issues in the repo rather than here so they stay with the code.",
            "The golden set is the part worth stealing even if you do not use the rest."
        )
    },
    @{
        Key          = "coe-deployment-guide"
        Title        = "CoE Starter Kit Deployment Guide"
        Description  = "What to turn on, in what order, and what to leave off when standing up the Microsoft CoE Starter Kit in a client tenant. Covers the inventory flows, the compliance process, and the three settings that most often cause a rollback."
        Tags         = @("coe", "governance", "power-platform")
        Type         = "Strategy"
        State        = "Published"
        Rationale    = "Reviewed and reflects the last four CoE deployments."
        Demo         = "https://cyclotron.sharepoint.com/sites/practice/coe-deployment"
        Area         = "Everyone"
        LinkedIdea   = $null
        Comments     = @()
    },
    @{
        Key          = "doc-extraction-toolkit"
        Title        = "Document Extraction Toolkit"
        Description  = "Model-per-document-type registry over Azure Document Intelligence, with a confidence gate and a Power Apps review queue for anything below threshold. Currently awaiting review."
        Tags         = @("document-intelligence", "azure-ai", "automation")
        Type         = "CustomSolution"
        State        = "Awaiting Approval"
        Repository   = "https://github.com/cyclotron/doc-extraction-toolkit"
        Demo         = "https://demo.cyclotron.com/doc-extraction"
        Area         = "Everyone"
        LinkedIdea   = $null
        Comments     = @()
    }
)

<#
    Adoption is where the seeded variety lives.

    Deliberately uneven, so the featured carousel's "Most adopted" slide picks a
    DIFFERENT solution than "Most upvoted" — with one voting identity the vote counts
    are all 0 or 1 and cannot separate anything on their own. Note the repeated team
    on the RFP agent: teams counts DISTINCT team names, so 4 adoptions across 3 teams
    is the case that catches a rollup counting rows instead of teams.
#>
$Adoptions = @(
    @{ Solution = "rfp-agent-solution"; Project = "Northwind RFP response"; Team = "Sales Engineering"; Status = "Using" },
    @{ Solution = "rfp-agent-solution"; Project = "Contoso managed services bid"; Team = "Sales Engineering"; Status = "Using" },
    @{ Solution = "rfp-agent-solution"; Project = "State of Ohio modernization"; Team = "Modern Work"; Status = "Implementing" },
    @{ Solution = "rfp-agent-solution"; Project = "Fabrikam analytics pursuit"; Team = "Data Platform"; Status = "Exploring" },
    @{ Solution = "rag-accelerator"; Project = "Litware knowledge assistant"; Team = "AI Engineering"; Status = "Using" },
    @{ Solution = "rag-accelerator"; Project = "Adventure Works policy search"; Team = "Data Platform"; Status = "Implementing" },
    @{ Solution = "alm-playbook"; Project = "Tailwind Power Platform rollout"; Team = "Delivery Ops"; Status = "Using"; Completed = $true }
)

# One vote per target: the (targetkey, voterid) alternate key rejects a second.
$Votes = @(
    @{ Type = "Solution"; Key = "rfp-agent-solution" },
    @{ Type = "Solution"; Key = "rag-accelerator" },
    @{ Type = "Solution"; Key = "coe-deployment-guide" },
    @{ Type = "Idea"; Key = "doc-intelligence" },
    @{ Type = "Idea"; Key = "copilot-readiness" },
    @{ Type = "Idea"; Key = "rfp-agent" }
)

$Participation = @(
    @{ Type = "Idea"; Key = "doc-intelligence"; Message = "I have built the confidence-gate pattern before and can take the review queue."; Status = "Proposed" },
    @{ Type = "Idea"; Key = "prompt-library"; Message = "Happy to seed this with the prompts from the RFP agent evaluation set."; Status = "Proposed" }
)

# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

function Get-AllWorkItemIds {
    $wiql = @{ query = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '$ProjectName'" }
    $result = Invoke-Ado -Method POST -Uri "$script:ProjectUrl/wit/wiql" -Body $wiql
    return @($result.workItems | ForEach-Object { $_.id })
}

function Clear-AdoWorkItems {
    Write-Step "Clearing work items in $ProjectName"
    $ids = Get-AllWorkItemIds
    if ($ids.Count -eq 0) { Write-Exists "no work items to remove"; return }

    # Links are deleted with their endpoints, so no unlink pass is needed. Delete in
    # descending id order so a Related link never briefly points at a deleted item
    # while its partner is still being read by anything else.
    foreach ($id in ($ids | Sort-Object -Descending)) {
        $destroy = if ($Purge.IsPresent) { "true" } else { "false" }
        Invoke-Ado -Method DELETE -Uri "https://dev.azure.com/$Organization/_apis/wit/workitems/$id`?destroy=$destroy" | Out-Null
        Write-Removed "work item $id$(if ($Purge.IsPresent) { ' (destroyed)' } else { ' (recycle bin)' })"
    }
}

function Clear-DataverseRows {
    Write-Step "Clearing Dataverse engagement rows"
    # cycai_momentum is included even though nothing writes it any more: a stale row
    # from an earlier design would be read in preference to nothing and quietly
    # contradict the live counts.
    $tables = @(
        @{ Set = "cycai_votes"; Id = "cycai_voteid" },
        @{ Set = "cycai_adoptions"; Id = "cycai_adoptionid" },
        @{ Set = "cycai_participations"; Id = "cycai_participationid" },
        @{ Set = "cycai_activities"; Id = "cycai_activityid" },
        @{ Set = "cycai_momentums"; Id = "cycai_momentumid" }
    )
    foreach ($table in $tables) {
        $rows = (Invoke-Dataverse -Method GET -Path "$($table.Set)?`$select=$($table.Id)").value
        if (-not $rows -or $rows.Count -eq 0) { Write-Exists "$($table.Set) already empty"; continue }
        foreach ($row in $rows) {
            Invoke-Dataverse -Method DELETE -Path "$($table.Set)($($row.($table.Id)))" | Out-Null
        }
        Write-Removed "$($rows.Count) row(s) from $($table.Set)"
    }
}

# ---------------------------------------------------------------------------
# ADO seeding
# ---------------------------------------------------------------------------

function Add-Field {
    param([string]$Path, $Value)
    return @{ op = "add"; path = "/fields/$Path"; value = $Value }
}

function Add-Relation {
    param([string]$Rel, [string]$Url, [string]$Comment)
    return @{
        op    = "add"
        path  = "/relations/-"
        value = @{ rel = $Rel; url = $Url; attributes = @{ comment = $Comment } }
    }
}

function New-HubWorkItem {
    param(
        [Parameter(Mandatory = $true)][string]$Type,
        [Parameter(Mandatory = $true)][hashtable]$Spec
    )

    $operations = [System.Collections.ArrayList]@()
    [void]$operations.Add((Add-Field -Path $FIELD.Title -Value $Spec.Title))
    [void]$operations.Add((Add-Field -Path $FIELD.Description -Value $Spec.Description))
    [void]$operations.Add((Add-Field -Path $FIELD.AreaPath -Value "$ProjectName\$($Spec.Area)"))
    if ($Spec.Tags) { [void]$operations.Add((Add-Field -Path $FIELD.Tags -Value ($Spec.Tags -join "; "))) }
    if ($Spec.Type) { [void]$operations.Add((Add-Field -Path $FIELD.SolutionType -Value $Spec.Type)) }
    if ($Spec.Repository) { [void]$operations.Add((Add-Relation -Rel "Hyperlink" -Url $Spec.Repository -Comment $LINK.Repository)) }
    if ($Spec.Demo) { [void]$operations.Add((Add-Relation -Rel "Hyperlink" -Url $Spec.Demo -Comment $LINK.Demo)) }

    # System.State is NOT set here. ADO accepts only the type's initial state on
    # create and answers anything else with "not in the list of supported values".
    $created = Invoke-Ado -Method POST -ContentType "application/json-patch+json" `
        -Uri "$script:ProjectUrl/wit/workitems/`$$Type" -Body $operations

    Write-Created "$Type $($created.id) — $($Spec.Title)"
    return $created
}

function Set-WorkItemState {
    param(
        [Parameter(Mandatory = $true)][int]$Id,
        [Parameter(Mandatory = $true)][string]$State,
        [string]$Rationale
    )

    $operations = [System.Collections.ArrayList]@()
    [void]$operations.Add((Add-Field -Path $FIELD.State -Value $State))
    # A process rule makes the rationale required on decision transitions; supplying
    # it unconditionally on a non-decision transition is harmless.
    if ($Rationale) { [void]$operations.Add((Add-Field -Path $FIELD.DecisionRationale -Value $Rationale)) }

    Invoke-Ado -Method PATCH -ContentType "application/json-patch+json" `
        -Uri "https://dev.azure.com/$Organization/_apis/wit/workitems/$Id" -Body $operations | Out-Null
    Write-Created "  state -> $State"
}

function Add-WorkItemComment {
    param([Parameter(Mandatory = $true)][int]$Id, [Parameter(Mandatory = $true)][string]$Text)
    # Comments are only on the preview api-version; the provider overrides it the
    # same way in ado/comments.ts.
    Invoke-Ado -Method POST -Version "7.1-preview.3" `
        -Uri "$script:ProjectUrl/wit/workItems/$Id/comments" -Body @{ text = $Text } | Out-Null
}

function Add-RelatedLink {
    param(
        [Parameter(Mandatory = $true)][int]$FromId,
        [Parameter(Mandatory = $true)][int]$ToId,
        [switch]$Canonical
    )
    $url = "https://dev.azure.com/$Organization/_apis/wit/workItems/$ToId"
    $comment = if ($Canonical.IsPresent) { $LINK.Canonical } else { "" }
    $operations = @((Add-Relation -Rel $RELATED -Url $url -Comment $comment))
    Invoke-Ado -Method PATCH -ContentType "application/json-patch+json" `
        -Uri "https://dev.azure.com/$Organization/_apis/wit/workitems/$FromId" -Body $operations | Out-Null
    Write-Created "  link $FromId -> $ToId$(if ($Canonical.IsPresent) { ' (canonical)' })"
}

function Invoke-AdoSeed {
    Write-Step "Seeding Azure DevOps work items"
    $created = @{}

    foreach ($idea in $Ideas) {
        $item = New-HubWorkItem -Type "Idea" -Spec $idea
        $created[$idea.Key] = [int]$item.id
        # Ideas land in Draft; anything else is a transition.
        if ($idea.State -ne "Draft") { Set-WorkItemState -Id $item.id -State $idea.State -Rationale $idea.Rationale }
        foreach ($text in $idea.Comments) { Add-WorkItemComment -Id $item.id -Text $text }
    }

    foreach ($solution in $Solutions) {
        $item = New-HubWorkItem -Type "Solution" -Spec $solution
        $created[$solution.Key] = [int]$item.id
        # Solutions already CREATE in Awaiting Approval — only move the others.
        if ($solution.State -ne "Awaiting Approval") { Set-WorkItemState -Id $item.id -State $solution.State -Rationale $solution.Rationale }
        foreach ($text in $solution.Comments) { Add-WorkItemComment -Id $item.id -Text $text }
    }

    Write-Step "Linking solutions to ideas"
    foreach ($solution in $Solutions) {
        if (-not $solution.LinkedIdea) { continue }
        Add-RelatedLink -FromId $created[$solution.LinkedIdea] -ToId $created[$solution.Key] -Canonical:$solution.Canonical
    }

    return $created
}

# ---------------------------------------------------------------------------
# Dataverse seeding
# ---------------------------------------------------------------------------

<#
    Resolve seeded work item ids by title.

    The two halves are independently runnable, so the Dataverse half cannot assume the
    ADO half ran in the same process. Titles in the seed set are unique, which makes
    them a usable handle; a title that resolves to zero or many items is a hard error
    rather than a silently skipped row.
#>
function Resolve-SeededIds {
    Write-Step "Resolving work item ids"
    $wiql = @{ query = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '$ProjectName'" }
    $result = Invoke-Ado -Method POST -Uri "$script:ProjectUrl/wit/wiql" -Body $wiql
    $ids = @($result.workItems | ForEach-Object { $_.id })
    if ($ids.Count -eq 0) { throw "No work items in $ProjectName. Run the ADO half first." }

    $byTitle = @{}
    foreach ($chunk in ($ids | ForEach-Object -Begin { $i = 0; $acc = @() } -Process {
                $acc += $_; if ($acc.Count -eq 200) { , $acc; $acc = @() }
            } -End { if ($acc.Count -gt 0) { , $acc } })) {
        $batch = Invoke-Ado -Method GET -Uri "$script:ProjectUrl/wit/workitems?ids=$($chunk -join ',')&fields=System.Id,System.Title"
        foreach ($item in $batch.value) { $byTitle[$item.fields.'System.Title'] = [int]$item.id }
    }

    $resolved = @{}
    foreach ($spec in ($Ideas + $Solutions)) {
        if (-not $byTitle.ContainsKey($spec.Title)) {
            throw "Work item '$($spec.Title)' not found in $ProjectName. Run the ADO half, or pass -Reset to reseed both."
        }
        $resolved[$spec.Key] = $byTitle[$spec.Title]
    }
    Write-Host "  resolved $($resolved.Count) items" -ForegroundColor DarkGray
    return $resolved
}

function Get-CurrentSystemUserId {
    $who = Invoke-Dataverse -Method GET -Path "WhoAmI"
    return $who.UserId
}

# request:123 / solution:123 — matches targetKey() in logic/domain/engagement.ts.
function Get-TargetKey {
    param([string]$Type, [int]$Id)
    $prefix = if ($Type -eq "Idea") { "request" } else { "solution" }
    return "$prefix`:$Id"
}

$CHOICE = @{
    HubType           = @{ Idea = 100000000; Solution = 100000001 }
    AdoptionStatus    = @{ Exploring = 100000000; Implementing = 100000001; Using = 100000002 }
    ParticipationStat = @{ Proposed = 100000000; Accepted = 100000001; Rejected = 100000002; Withdrawn = 100000003 }
    ActorType         = @{ User = 100000000; Agent = 100000001; System = 100000002 }
}

function Invoke-DataverseSeed {
    param([Parameter(Mandatory = $true)][hashtable]$Ids)

    $userId = Get-CurrentSystemUserId
    $userBind = "/systemusers($userId)"
    Write-Host "  acting as systemuser $userId" -ForegroundColor DarkGray

    Write-Step "Seeding votes"
    foreach ($vote in $Votes) {
        $id = $Ids[$vote.Key]
        $key = Get-TargetKey -Type $vote.Type -Id $id
        Invoke-Dataverse -Method POST -Path "cycai_votes" -Body @{
            cycai_name                 = $key
            cycai_targetkey            = $key
            cycai_targetid             = $id
            cycai_targettype           = $CHOICE.HubType[$vote.Type]
            "cycai_voterid@odata.bind" = $userBind
        } | Out-Null
        Write-Created "vote on $key"
    }

    Write-Step "Seeding adoptions"
    # Walked backwards through time so startedon is spread out rather than all
    # landing in the same second, which would make "recent" meaningless.
    $offset = $Adoptions.Count * 6
    foreach ($adoption in $Adoptions) {
        $solutionId = $Ids[$adoption.Solution]
        $startedOn = (Get-Date).ToUniversalTime().AddDays(-$offset)
        $body = @{
            cycai_name                     = $adoption.Project
            cycai_solutionid               = $solutionId
            cycai_projectname              = $adoption.Project
            cycai_team                     = $adoption.Team
            cycai_adoptionstatus           = $CHOICE.AdoptionStatus[$adoption.Status]
            cycai_startedon                = $startedOn.ToString("o")
            "cycai_startedbyid@odata.bind" = $userBind
        }
        # completedon is what the rollup reads to split active from completed uses —
        # the status choice is NOT the signal, matching the .NET summary endpoint.
        # Halfway to now rather than a fixed offset, so a rollout that started six days
        # ago does not finish three days in the future.
        if ($adoption.Completed) {
            $midpoint = $startedOn.AddSeconds(((Get-Date).ToUniversalTime() - $startedOn).TotalSeconds / 2)
            $body.cycai_completedon = $midpoint.ToString("o")
        }
        Invoke-Dataverse -Method POST -Path "cycai_adoptions" -Body $body | Out-Null
        Write-Created "adoption '$($adoption.Project)' ($($adoption.Team)) on solution $solutionId"
        $offset -= 6
    }

    Write-Step "Seeding participation"
    foreach ($request in $Participation) {
        $id = $Ids[$request.Key]
        $key = Get-TargetKey -Type $request.Type -Id $id
        Invoke-Dataverse -Method POST -Path "cycai_participations" -Body @{
            cycai_name                       = $key
            cycai_targetkey                  = $key
            cycai_targetid                   = $id
            cycai_targettype                 = $CHOICE.HubType[$request.Type]
            cycai_message                    = $request.Message
            cycai_participationstatus        = $CHOICE.ParticipationStat[$request.Status]
            "cycai_requestedbyid@odata.bind" = $userBind
        } | Out-Null
        Write-Created "participation on $key"
    }

    Write-Step "Seeding the activity feed"
    <#
        The app appends these itself on every mutation, but seeding through the API
        bypasses the app, so the feed would otherwise be empty for everything above.

        cycai_summary carries the team for the solutionUse.* actions. That is what the
        shared UI now reads to say "started using this on behalf of the Data Platform
        team" — a row with a blank summary must still render, which is why some of the
        rows below deliberately have none.
    #>
    $feed = [System.Collections.ArrayList]@()
    function Add-Feed {
        param([string]$Action, [string]$Type, [int]$Id, [string]$Summary, [double]$DaysAgo)
        [void]$feed.Add(@{ Action = $Action; Type = $Type; Id = $Id; Summary = $Summary; DaysAgo = $DaysAgo })
    }

    foreach ($idea in $Ideas) {
        Add-Feed -Action "request.created" -Type "Idea" -Id $Ids[$idea.Key] -Summary $idea.Title -DaysAgo 40
        if ($idea.State -eq "Accepted") {
            Add-Feed -Action "request.accepted" -Type "Idea" -Id $Ids[$idea.Key] -Summary $idea.Rationale -DaysAgo 30
        }
        if ($idea.State -eq "Rejected") {
            Add-Feed -Action "request.rejected" -Type "Idea" -Id $Ids[$idea.Key] -Summary $idea.Rationale -DaysAgo 28
        }
    }
    foreach ($solution in $Solutions) {
        Add-Feed -Action "solution.created" -Type "Solution" -Id $Ids[$solution.Key] -Summary $solution.Title -DaysAgo 24
        if ($solution.State -eq "Published") {
            Add-Feed -Action "solution.published" -Type "Solution" -Id $Ids[$solution.Key] -Summary $solution.Rationale -DaysAgo 18
        }
        foreach ($text in $solution.Comments) {
            Add-Feed -Action "comment.added" -Type "Solution" -Id $Ids[$solution.Key] -Summary $text -DaysAgo 12
        }
    }
    foreach ($vote in $Votes) {
        Add-Feed -Action "vote.added" -Type $vote.Type -Id $Ids[$vote.Key] -Summary "" -DaysAgo 8
    }
    $adoptionDays = 7.0
    foreach ($adoption in $Adoptions) {
        $action = if ($adoption.Completed) { "solutionUse.completed" } else { "solutionUse.started" }
        Add-Feed -Action $action -Type "Solution" -Id $Ids[$adoption.Solution] -Summary $adoption.Team -DaysAgo $adoptionDays
        $adoptionDays -= 0.5
    }
    # One deliberately blank-summary adoption row: rows written before the vocabulary
    # existed have no team, and the phrasing must degrade to "started using" rather
    # than emitting "on behalf of ".
    Add-Feed -Action "solutionUse.started" -Type "Solution" -Id $Ids["coe-deployment-guide"] -Summary "" -DaysAgo 2

    foreach ($entry in $feed) {
        $occurred = (Get-Date).ToUniversalTime().AddDays(-$entry.DaysAgo)
        $body = @{
            cycai_name                 = "$($entry.Action) $($entry.Id)"
            cycai_action               = $entry.Action
            cycai_subjectid            = $entry.Id
            cycai_subjectkey           = "$($entry.Type):$($entry.Id)"
            cycai_subjecttype          = $CHOICE.HubType[$entry.Type]
            cycai_actortype            = $CHOICE.ActorType.User
            cycai_occurredon           = $occurred.ToString("o")
            "cycai_actorid@odata.bind" = $userBind
        }
        if ($entry.Summary) { $body.cycai_summary = $entry.Summary.Substring(0, [Math]::Min(400, $entry.Summary.Length)) }
        Invoke-Dataverse -Method POST -Path "cycai_activities" -Body $body | Out-Null
    }
    Write-Created "$($feed.Count) activity rows"
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

Write-Host "Organization : $Organization" -ForegroundColor DarkGray
Write-Host "Project      : $ProjectName" -ForegroundColor DarkGray
Write-Host "Dataverse    : $EnvironmentUrl" -ForegroundColor DarkGray

if ($Reset.IsPresent) {
    if (-not $SkipAdo.IsPresent) { Clear-AdoWorkItems }
    if (-not $SkipDataverse.IsPresent) { Clear-DataverseRows }
}

$ids = if (-not $SkipAdo.IsPresent) { Invoke-AdoSeed } else { $null }

if (-not $SkipDataverse.IsPresent) {
    if (-not $ids) { $ids = Resolve-SeededIds }
    Invoke-DataverseSeed -Ids $ids
}

Write-Step "Done"
if ($ids) {
    foreach ($key in ($ids.Keys | Sort-Object)) {
        Write-Host ("  {0,-24} {1}" -f $key, $ids[$key]) -ForegroundColor DarkGray
    }
}
