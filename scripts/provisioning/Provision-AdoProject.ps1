#Requires -Version 7.0
<#
.SYNOPSIS
    Provisions the Azure DevOps project that hosts the Innovation Backlog.
.DESCRIPTION
    Creates the project on the inherited process produced by Provision-AdoProcess.ps1,
    then the three visibility area paths and the Approvers group, and restricts the
    area paths so ItemVisibility is enforced by Azure DevOps rather than by the client.

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

    [switch]$SkipAreaPathSecurity
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
