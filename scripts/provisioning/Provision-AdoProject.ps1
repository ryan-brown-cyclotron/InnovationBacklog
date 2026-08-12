#Requires -Version 7.0
<#
.SYNOPSIS
    Provisions the Azure DevOps project that hosts the Innovation Backlog.
.DESCRIPTION
    Creates the project on the inherited process produced by Provision-AdoProcess.ps1,
    then the three visibility area paths and the Approvers group, restricts the area
    paths so ItemVisibility is enforced by Azure DevOps rather than by the client, and
    creates the shared queries that are the only view of the Solution hierarchy the
    product can render.

    Idempotent: every Ensure-* helper reads before it writes.

    KNOWN PARITY GAP. ItemVisibility.Approvers in the Momentum domain means
    "approvers, administrators, AND the person who shared it". Area-path ACLs have no
    owner exception, so an author cannot see their own restricted idea once it moves
    to the Approvers node. There is no client-side workaround: the data never
    arrives. This was accepted when the plan was approved.
.PARAMETER Organization
    Azure DevOps organization name.
.PARAMETER ProjectName
    Name of the project to create.
.PARAMETER ProcessId
    Process type id emitted by Provision-AdoProcess.ps1.
.PARAMETER Pat
    Personal access token with Project and Team (Manage), Work Items (Manage), and
    Graph (Manage) scopes. Defaults to $env:AZDO_PAT.
.PARAMETER SkipAreaPathSecurity
    Create the area paths but leave their permissions inherited. Use this if you want
    to review the ACL changes before applying them.
.PARAMETER SkipQueries
    Leave Shared Queries untouched.
.PARAMETER QueryFolderName
    Folder created under Shared Queries to hold them.
.EXAMPLE
    .\Provision-AdoProject.ps1 -Organization contoso -ProcessId 3f1a... -Pat $env:AZDO_PAT
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Organization,

    [Parameter(Mandatory = $true)]
    [string]$ProcessId,

    [string]$ProjectName = "Innovation Backlog",

    [string]$Pat = $env:AZDO_PAT,

    <#
        Organization-level, matching the group the process rule references. See the
        note above the group lookup for why this is not a project group.
    #>
    [string]$ApproverGroup = "[CyclotronInc]\Innovation Backlog Approvers",

    [switch]$SkipAreaPathSecurity,

    <#
        Shared queries are the only view of the Solution hierarchy that Azure DevOps
        can render — see the block above Ensure-Query. Skip them only when the caller
        lacks permission to write to Shared Queries.
    #>
    [switch]$SkipQueries,

    [string]$QueryFolderName = "Innovation Backlog"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Pat)) {
    throw "No personal access token. Pass -Pat or set `$env:AZDO_PAT."
}

$script:ApiVersion = "7.1"
$script:CoreUrl = "https://dev.azure.com/$Organization/_apis"
$script:GraphUrl = "https://vssps.dev.azure.com/$Organization/_apis"
$script:AuthHeader = @{
    Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$Pat"))
}

# Common Structure Service security namespace. Area and iteration node permissions
# live here; the bits we care about are WORK_ITEM_READ (16) and WORK_ITEM_WRITE (32).
$script:CssNamespaceId = "83e28ad4-2d72-4ceb-97b0-c7726d5502c3"
$script:WorkItemRead = 16
$script:WorkItemWrite = 32

function Write-Created { param([string]$Message) Write-Host "  Created $Message" -ForegroundColor Green }
function Write-Exists { param([string]$Message) Write-Host "  Exists  $Message" -ForegroundColor DarkGray }
function Write-Step { param([string]$Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Warn { param([string]$Message) Write-Host "  Warn    $Message" -ForegroundColor Yellow }

function Invoke-Ado {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Uri,
        [object]$Body,
        [string]$Version = $script:ApiVersion,
        [switch]$AllowNotFound
    )

    $separator = if ($Uri.Contains("?")) { "&" } else { "?" }
    $full = "$Uri$separator" + "api-version=$Version"

    $params = @{
        Method      = $Method
        Uri         = $full
        Headers     = $script:AuthHeader
        ContentType = "application/json"
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }

    try {
        return Invoke-RestMethod @params
    }
    catch {
        $response = $_.Exception.Response
        $status = if ($response) { [int]$response.StatusCode } else { 0 }
        if ($status -eq 404 -and $AllowNotFound.IsPresent) { return $null }

        $detail = ""
        try { $detail = $_.ErrorDetails.Message } catch { }
        if ([string]::IsNullOrWhiteSpace($detail)) { $detail = $_.Exception.Message }
        throw "$Method $full failed ($status): $detail"
    }
}

# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------

<#
    Project creation is asynchronous. The POST returns an operation reference; the
    project does not exist until that operation reports "succeeded".
#>
function Ensure-Project {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$TemplateTypeId,
        [string]$Description = "",
        [int]$TimeoutSeconds = 300
    )

    $existing = Invoke-Ado -Method GET -Uri "$script:CoreUrl/projects/$Name" -AllowNotFound
    if ($existing) {
        Write-Exists "project '$Name' ($($existing.id))"
        return $existing.id
    }

    Write-Host "  Creating project '$Name' (asynchronous)..." -ForegroundColor DarkGray
    $operation = Invoke-Ado -Method POST -Uri "$script:CoreUrl/projects" -Body @{
        name         = $Name
        description  = $Description
        visibility   = "private"
        capabilities = @{
            versioncontrol  = @{ sourceControlType = "Git" }
            processTemplate = @{ templateTypeId = $TemplateTypeId }
        }
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Seconds 5
        $status = Invoke-Ado -Method GET -Uri "$script:CoreUrl/operations/$($operation.id)"
        if ($status.status -eq "failed") {
            throw "Project creation failed: $($status.detailedMessage ?? $status.resultMessage)"
        }
        if ((Get-Date) -gt $deadline) {
            throw "Project creation did not complete within $TimeoutSeconds seconds (last status: $($status.status))."
        }
    } while ($status.status -notin @("succeeded"))

    $created = Invoke-Ado -Method GET -Uri "$script:CoreUrl/projects/$Name"
    Write-Created "project '$Name' ($($created.id))"
    return $created.id
}

# ---------------------------------------------------------------------------
# Area paths
# ---------------------------------------------------------------------------

function Ensure-AreaPath {
    param(
        [Parameter(Mandatory = $true)][string]$Project,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $uri = "https://dev.azure.com/$Organization/$Project/_apis/wit/classificationnodes/areas"
    $existing = Invoke-Ado -Method GET -Uri "$uri/$Name" -AllowNotFound
    if ($existing) {
        Write-Exists "area path '\$Project\$Name'"
        return $existing
    }

    $created = Invoke-Ado -Method POST -Uri $uri -Body @{ name = $Name }
    Write-Created "area path '\$Project\$Name'"
    return $created
}

# ---------------------------------------------------------------------------
# Groups and identities
# ---------------------------------------------------------------------------

<#
    Graph calls live on the vssps host and are still preview-versioned. The scope
    descriptor turns a project id into the container a project-scoped group belongs to.
#>
function Get-ProjectScopeDescriptor {
    param([Parameter(Mandatory = $true)][string]$ProjectId)

    $result = Invoke-Ado -Method GET -Uri "$script:GraphUrl/graph/descriptors/$ProjectId" -Version "7.1-preview.1"
    return $result.value
}

function Ensure-ProjectGroup {
    param(
        [Parameter(Mandatory = $true)][string]$ScopeDescriptor,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [string]$Description = ""
    )

    $groups = Invoke-Ado -Method GET `
        -Uri "$script:GraphUrl/graph/groups?scopeDescriptor=$ScopeDescriptor" -Version "7.1-preview.1"

    $existing = $groups.value | Where-Object { $_.displayName -eq $DisplayName }
    if ($existing) {
        Write-Exists "group '$DisplayName'"
        return $existing.descriptor
    }

    $created = Invoke-Ado -Method POST `
        -Uri "$script:GraphUrl/graph/groups?scopeDescriptor=$ScopeDescriptor" -Version "7.1-preview.1" `
        -Body @{ displayName = $DisplayName; description = $Description }

    Write-Created "group '$DisplayName'"
    return $created.descriptor
}

<#
    The access-control APIs predate Graph and speak the legacy identity descriptor
    ("Microsoft.TeamFoundation.Identity;S-1-9-..."), not the Graph subject descriptor.
    They are different strings for the same principal and are not interchangeable.
#>
function Get-LegacyDescriptor {
    param([Parameter(Mandatory = $true)][string]$SubjectDescriptor)

    $result = Invoke-Ado -Method GET `
        -Uri "$script:GraphUrl/identities?subjectDescriptors=$SubjectDescriptor" -Version "7.1"

    if (-not $result.value -or $result.value.Count -eq 0) {
        throw "Could not resolve a legacy identity descriptor for subject '$SubjectDescriptor'."
    }
    return $result.value[0].descriptor
}

function Get-ProjectGroupDescriptor {
    param(
        [Parameter(Mandatory = $true)][string]$ScopeDescriptor,
        [Parameter(Mandatory = $true)][string]$DisplayName
    )

    $groups = Invoke-Ado -Method GET `
        -Uri "$script:GraphUrl/graph/groups?scopeDescriptor=$ScopeDescriptor" -Version "7.1-preview.1"

    $group = $groups.value | Where-Object { $_.displayName -eq $DisplayName }
    if (-not $group) {
        $available = ($groups.value | ForEach-Object { $_.displayName }) -join ", "
        throw "Built-in group '$DisplayName' not found. Available: $available"
    }
    return $group.descriptor
}

# ---------------------------------------------------------------------------
# Area path security
# ---------------------------------------------------------------------------

<#
    Classification node tokens are hierarchical and built from node GUIDs, not names:
        vstfs:///Classification/Node/{rootGuid}:vstfs:///Classification/Node/{childGuid}
#>
function Get-AreaNodeToken {
    param(
        [Parameter(Mandatory = $true)][string]$Project,
        [Parameter(Mandatory = $true)][string]$ChildName
    )

    $root = Invoke-Ado -Method GET `
        -Uri "https://dev.azure.com/$Organization/$Project/_apis/wit/classificationnodes/areas?`$depth=2"

    $child = $root.children | Where-Object { $_.name -eq $ChildName }
    if (-not $child) {
        throw "Area node '$ChildName' not found under '\$Project'."
    }
    return "vstfs:///Classification/Node/$($root.identifier):vstfs:///Classification/Node/$($child.identifier)"
}

<#
    Restricting an area path is NOT "deny to everyone, allow to the group" — within a
    single ACL an explicit deny beats an explicit allow, so anyone in both groups
    would be denied. The working pattern is to break inheritance on the node and then
    grant an explicit allow only to the principals who should see it.
#>
function Set-AreaPathAccess {
    param(
        [Parameter(Mandatory = $true)][string]$Token,
        [Parameter(Mandatory = $true)][string[]]$AllowDescriptors,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $aces = @{}
    foreach ($descriptor in $AllowDescriptors) {
        $aces[$descriptor] = @{
            descriptor = $descriptor
            allow      = $script:WorkItemRead -bor $script:WorkItemWrite
            deny       = 0
        }
    }

    Invoke-Ado -Method POST -Uri "$script:CoreUrl/accesscontrollists/$script:CssNamespaceId" -Body @{
        count = 1
        value = @(
            @{
                token              = $Token
                inheritPermissions = $false
                acesDictionary     = $aces
            }
        )
    } | Out-Null

    Write-Created "restricted access on $Label to $($AllowDescriptors.Count) group(s)"
}

# ---------------------------------------------------------------------------
# Shared queries
# ---------------------------------------------------------------------------

<#
    WHY THESE EXIST AT ALL.

    Backlogs and boards in Azure DevOps are driven by BEHAVIORS (backlog levels), and
    Provision-AdoProcess.ps1 assigns one to exactly two types: Idea takes Epics and
    Backlog Item takes the requirement level. Solution and Milestone deliberately take
    none — a catalog entry and a promise about one are not delivery work.

    The consequence is that the Solution -> Issue / Solution -> Milestone hierarchy,
    which is real and linked with System.LinkTypes.Hierarchy-Reverse, renders NOWHERE
    in the product's built-in surfaces. Not a backlog, not a board, not a sprint. The
    only alternative would be to give Solution a backlog level, which is precisely the
    trade-off that was refused for Issue: it would put catalog entries on the delivery
    board next to real work.

    Queries are indifferent to backlog levels, which makes a tree query the one
    mechanism that can show this at all.

    They are also the cheapest thing in this whole provisioning surface. A field name,
    a work item type name and a picklist value are permanent and organization-wide; a
    query is project-scoped, renamable, and deletable with no residue. Guessing wrong
    here costs nothing, which is why the set below leans toward being useful rather
    than toward being minimal.
#>

function Write-Updated { param([string]$Message) Write-Host "  Updated $Message" -ForegroundColor Yellow }

<# A query path is slash-separated, and every segment here contains a space. #>
function Get-QueryUri {
    param(
        [Parameter(Mandatory = $true)][string]$Project,
        [string]$Path
    )

    $base = "https://dev.azure.com/$Organization/$([uri]::EscapeDataString($Project))/_apis/wit/queries"
    if ([string]::IsNullOrWhiteSpace($Path)) { return $base }

    $encoded = ($Path -split "/" | ForEach-Object { [uri]::EscapeDataString($_) }) -join "/"
    return "$base/$encoded"
}

<#
    Runs the WIQL before storing it.

    A read, and a cheap one — but the reason it is here is that a malformed query is
    otherwise created successfully and only fails when a human opens it, by which
    point the provisioning run has reported success. Failing at the point of
    provisioning is the whole value of provisioning.
#>
function Test-Wiql {
    param(
        [Parameter(Mandatory = $true)][string]$Project,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Wiql
    )

    try {
        Invoke-Ado -Method POST `
            -Uri "https://dev.azure.com/$Organization/$([uri]::EscapeDataString($Project))/_apis/wit/wiql?`$top=1" `
            -Body @{ query = $Wiql } | Out-Null
    }
    catch {
        throw "Query '$Name' has invalid WIQL and was not created. Azure DevOps said: $_"
    }
}

function Ensure-QueryFolder {
    param(
        [Parameter(Mandatory = $true)][string]$Project,
        [Parameter(Mandatory = $true)][string]$Parent,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $existing = Invoke-Ado -Method GET -Uri (Get-QueryUri -Project $Project -Path "$Parent/$Name") -AllowNotFound
    if ($existing) {
        Write-Exists "query folder '$Parent/$Name'"
        return $existing
    }

    $created = Invoke-Ado -Method POST -Uri (Get-QueryUri -Project $Project -Path $Parent) -Body @{
        name     = $Name
        isFolder = $true
    }
    Write-Created "query folder '$Parent/$Name'"
    return $created
}

<#
    Reconciled, not skipped, and the WIQL is OVERWRITTEN when it differs.

    Unlike a picklist value — where an existing entry may already be stored on work
    items, so removing it would strand them — nothing downstream depends on a query's
    definition. A query is a saved question. If the question in this script and the
    question in the organization disagree, this script is the one under review, so it
    wins. Renaming a query by editing $Queries leaves the old one behind; that is
    deliberate, because a name is how someone's bookmark finds it.
#>
function Ensure-Query {
    param(
        [Parameter(Mandatory = $true)][string]$Project,
        [Parameter(Mandatory = $true)][string]$Folder,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Wiql
    )

    Test-Wiql -Project $Project -Name $Name -Wiql $Wiql

    $path = "$Folder/$Name"
    # $expand=wiql, because the default projection omits it and there would be
    # nothing to compare against.
    $existing = Invoke-Ado -Method GET `
        -Uri ((Get-QueryUri -Project $Project -Path $path) + "?`$expand=wiql") -AllowNotFound

    if ($existing) {
        <#
            Azure DevOps REWRITES a stored query rather than keeping the text it was
            given, so a raw compare reports a difference on every run and this helper
            would PATCH five queries forever. Three transformations were observed:

              whitespace   the WIQL below is a readable here-string; ADO returns one line
              keywords     SELECT / FROM / WHERE / AND / IN / MODE come back lowercased
              [Source].    de-bracketed to Source. in link queries (flat ones round-trip)

            Case-insensitive is safe rather than lazy: WIQL keywords and field names are
            case-insensitive to the engine, so two queries differing only in case ARE
            the same query, and treating them as different would mean rewriting a query
            that nobody changed.
        #>
        $normalize = {
            param($text)
            (($text -replace "\s+", " ") -replace "\[(Source|Target)\]\.", '$1.').Trim()
        }
        if ((& $normalize $existing.wiql) -ieq (& $normalize $Wiql)) {
            Write-Exists "query '$path'"
            return $existing
        }

        $updated = Invoke-Ado -Method PATCH `
            -Uri (Get-QueryUri -Project $Project -Path $path) -Body @{ wiql = $Wiql }
        Write-Updated "query '$path'"
        return $updated
    }

    $created = Invoke-Ado -Method POST `
        -Uri (Get-QueryUri -Project $Project -Path $Folder) -Body @{
        name = $Name
        wiql = $Wiql
    }
    Write-Created "query '$path'"
    return $created
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

Write-Step "Ensuring the project..."
$projectId = Ensure-Project `
    -Name $ProjectName `
    -TemplateTypeId $ProcessId `
    -Description "Ideas, reusable solutions, and the delivery work they become."

Write-Step "Ensuring visibility area paths..."
# \Everyone is the default and stays inherited: any project member can read it.
Ensure-AreaPath -Project $ProjectName -Name "Everyone"  | Out-Null
Ensure-AreaPath -Project $ProjectName -Name "Approvers" | Out-Null
Ensure-AreaPath -Project $ProjectName -Name "Hidden"    | Out-Null

Write-Step "Resolving groups..."
$scopeDescriptor = Get-ProjectScopeDescriptor -ProjectId $projectId

<#
    Approvers is ORGANIZATION-level, deliberately, and is not created here.

    The rule that enforces it lives on the process and stores a single group GUID,
    so a project-scoped group would gate whichever project it belongs to and
    silently do nothing in the other project sharing the process. One group, bound
    to Innovation Backlog rather than to a project.
#>
$approversSubject = (Invoke-Ado -Method GET `
        -Uri "$script:GraphUrl/graph/groups" -Version "7.1-preview.1").value |
    Where-Object { $_.principalName -eq $ApproverGroup } |
    Select-Object -ExpandProperty descriptor -First 1

if (-not $approversSubject) {
    throw "Group '$ApproverGroup' not found. Provision-AdoProcess.ps1 references it in the approver rule, so it must exist before the area paths can grant it access."
}
Write-Exists "group '$ApproverGroup'"

if ($SkipAreaPathSecurity) {
    Write-Step "Skipping area path security (-SkipAreaPathSecurity)."
    Write-Warn "ItemVisibility is NOT enforced until the area path ACLs are applied."
}
else {
    Write-Step "Restricting area path access..."

    $adminsSubject = Get-ProjectGroupDescriptor -ScopeDescriptor $scopeDescriptor -DisplayName "Project Administrators"
    $approversLegacy = Get-LegacyDescriptor -SubjectDescriptor $approversSubject
    $adminsLegacy = Get-LegacyDescriptor -SubjectDescriptor $adminsSubject

    Set-AreaPathAccess `
        -Token (Get-AreaNodeToken -Project $ProjectName -ChildName "Approvers") `
        -AllowDescriptors @($approversLegacy, $adminsLegacy) `
        -Label "\$ProjectName\Approvers"

    Set-AreaPathAccess `
        -Token (Get-AreaNodeToken -Project $ProjectName -ChildName "Hidden") `
        -AllowDescriptors @($adminsLegacy) `
        -Label "\$ProjectName\Hidden"
}

if ($SkipQueries) {
    Write-Step "Skipping shared queries (-SkipQueries)."
}
else {
    Write-Step "Ensuring shared queries..."
    $queryFolder = "Shared Queries/$QueryFolderName"
    Ensure-QueryFolder -Project $ProjectName -Parent "Shared Queries" -Name $QueryFolderName | Out-Null

    <#
        Ordered by what is INVISIBLE without them.

        Solution and Milestone have no backlog level, so the first three exist because
        there is otherwise no way to see those records in Azure DevOps at all. The
        Idea tree is a convenience — Idea sits on the Epics backlog, so its Backlog
        Item children are already reachable — and is here because it is the same
        query with one noun changed. The last one is a net for link bugs.
    #>
    $queries = @(
        @{
            Name = "Solution tree"
            Wiql = @"
SELECT [System.Id], [System.WorkItemType], [System.Title], [System.State], [System.AssignedTo]
FROM workItemLinks
WHERE ([Source].[System.TeamProject] = @project
        AND [Source].[System.WorkItemType] = 'Solution')
    AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')
MODE (Recursive)
"@
        },
        @{
            Name = "Solutions"
            Wiql = @"
SELECT [System.Id], [System.Title], [System.State], [Custom.InnovationBacklogSolutionType],
        [System.AssignedTo], [System.AreaPath], [System.Tags], [System.ChangedDate]
FROM WorkItems
WHERE [System.TeamProject] = @project
    AND [System.WorkItemType] = 'Solution'
ORDER BY [System.ChangedDate] DESC
"@
        },
        @{
            Name = "Roadmap"
            Wiql = @"
SELECT [System.Id], [System.Title], [System.State], [Custom.InnovationBacklogTargetLabel],
        [Microsoft.VSTS.Scheduling.TargetDate], [System.Parent]
FROM WorkItems
WHERE [System.TeamProject] = @project
    AND [System.WorkItemType] = 'Milestone'
    AND [System.State] <> 'Cancelled'
ORDER BY [Microsoft.VSTS.Scheduling.TargetDate] ASC
"@
        },
        @{
            Name = "Idea tree"
            Wiql = @"
SELECT [System.Id], [System.WorkItemType], [System.Title], [System.State], [System.AssignedTo]
FROM workItemLinks
WHERE ([Source].[System.TeamProject] = @project
        AND [Source].[System.WorkItemType] = 'Idea')
    AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')
MODE (Recursive)
"@
        },
        @{
            Name = "Unparented feedback"
            Wiql = @"
SELECT [System.Id], [System.WorkItemType], [System.Title], [System.State],
        [System.CreatedBy], [System.CreatedDate]
FROM workItemLinks
WHERE ([Source].[System.TeamProject] = @project
        AND [Source].[System.WorkItemType] IN ('Issue', 'Milestone'))
    AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Reverse')
MODE (DoesNotContain)
"@
        }
    )

    foreach ($query in $queries) {
        Ensure-Query -Project $ProjectName -Folder $queryFolder -Name $query.Name -Wiql $query.Wiql | Out-Null
    }
}

Write-Host ""
Write-Host "Project provisioning complete." -ForegroundColor Green
Write-Host ""
Write-Host "Pass these to Provision-DataverseSchema.ps1:" -ForegroundColor Cyan
Write-Host "  -AdoOrgId    $Organization"
Write-Host "  -AdoProjectId $projectId"
Write-Host ""
Write-Host "Verify before relying on visibility:" -ForegroundColor Cyan
Write-Host "  - A non-approver cannot read a work item on the \Approvers area path."
Write-Host "  - A non-administrator cannot read one on \Hidden."
Write-Host ""

[PSCustomObject]@{
    Organization = $Organization
    ProjectId    = $projectId
    ProjectName  = $ProjectName
    ProcessId    = $ProcessId
}
