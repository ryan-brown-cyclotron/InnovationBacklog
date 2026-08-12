#Requires -Version 7.0
<#
.SYNOPSIS
    Provisions the "Innovation Backlog" inherited process in Azure DevOps.
.DESCRIPTION
    Creates an inherited process based on Basic, then the Idea, Solution, Backlog
    Item and Milestone work item types with their states, custom fields and rules,
    and re-enables Basic's inherited Issue type.

    Every operation is idempotent: each Ensure-* helper reads before it writes and
    reports "Exists" instead of failing. Re-running the script changes nothing.

    IMMUTABILITY WARNING. Work item type names, state names, and field names and
    types are permanent once created in Azure DevOps. The helpers below fail loudly
    when an existing object disagrees with the definition rather than silently
    leaving the process in a half-migrated state.
.PARAMETER Organization
    Azure DevOps organization name (the "contoso" in https://dev.azure.com/contoso).
.PARAMETER ProcessName
    Display name of the inherited process to create.
.PARAMETER Pat
    Personal access token with Work Items (Manage) scope at organization level.
    Defaults to $env:AZDO_PAT.
.EXAMPLE
    .\Provision-AdoProcess.ps1 -Organization contoso -Pat $env:AZDO_PAT
.OUTPUTS
    Writes the process id and work item type reference names to the pipeline as a
    PSCustomObject, and prints the values Provision-AdoProject.ps1 needs.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Organization,

    [string]$ProcessName = "Innovation Backlog",

    [string]$ProcessReferenceName = "Custom.InnovationBacklog",

    <#
        Rules live on the PROCESS, but a group reference like "[MyProject]\Approvers"
        resolves per project. One process serving two projects (a dev one and a real
        one) therefore cannot reference a project group — the rule would silently
        fail to gate the other project. Both default to ORGANIZATION-level groups,
        which resolve identically everywhere the process is used.
    #>
    [string]$ApproverGroup = "[CyclotronInc]\Innovation Backlog Approvers",

    [string]$AdministratorGroup = "[CyclotronInc]\Project Collection Administrators",

    [string]$Pat = $env:AZDO_PAT
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Pat)) {
    throw "No personal access token. Pass -Pat or set `$env:AZDO_PAT. The token needs Work Items (Manage) scope at organization level."
}

$script:ApiVersion = "7.1"
$script:BaseUrl = "https://dev.azure.com/$Organization/_apis"
$script:AuthHeader = @{
    Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$Pat"))
}

# ---------------------------------------------------------------------------
# REST plumbing
# ---------------------------------------------------------------------------

<#
    Azure DevOps delays rather than rejects when a caller approaches the 200 TSTU
    per five-minute budget, and sends Retry-After when it does. Honour it — the
    process APIs are cheap but a full provisioning run makes ~60 calls.
#>
function Invoke-Ado {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body,
        [switch]$AllowNotFound
    )

    $separator = if ($Path.Contains("?")) { "&" } else { "?" }
    $uri = "$script:BaseUrl/$Path$separator" + "api-version=$script:ApiVersion"

    $params = @{
        Method      = $Method
        Uri         = $uri
        Headers     = $script:AuthHeader
        ContentType = "application/json"
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }

    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            return Invoke-RestMethod @params
        }
        catch {
            $response = $_.Exception.Response
            $status = if ($response) { [int]$response.StatusCode } else { 0 }

            if ($status -eq 404 -and $AllowNotFound.IsPresent) { return $null }

            if ($status -eq 429 -and $attempt -lt 4) {
                $retryAfter = 5
                try {
                    $values = $response.Headers.GetValues("Retry-After")
                    if ($values -and $values[0] -as [int]) { $retryAfter = [int]$values[0] }
                }
                catch { }
                Write-Host "  Throttled by Azure DevOps; waiting $retryAfter s" -ForegroundColor DarkYellow
                Start-Sleep -Seconds $retryAfter
                continue
            }

            # ADO puts the useful diagnostic in the body, not the status line.
            $detail = ""
            try { $detail = $_.ErrorDetails.Message } catch { }
            if ([string]::IsNullOrWhiteSpace($detail)) { $detail = $_.Exception.Message }
            throw "$Method $uri failed ($status): $detail"
        }
    }
}

function Write-Created { param([string]$Message) Write-Host "  Created $Message" -ForegroundColor Green }
function Write-Exists { param([string]$Message) Write-Host "  Exists  $Message" -ForegroundColor DarkGray }
function Write-Updated { param([string]$Message) Write-Host "  Updated $Message" -ForegroundColor Yellow }
function Write-Step { param([string]$Message) Write-Host $Message -ForegroundColor Cyan }

# ---------------------------------------------------------------------------
# Ensure-* helpers
# ---------------------------------------------------------------------------

<#
    The Basic process type id is not documented as a stable well-known GUID the way
    Agile's is (adcc42ab-9882-485e-a3ed-7678f01f66bc), so resolve it by name.
#>
function Get-SystemProcessId {
    param([Parameter(Mandatory = $true)][string]$Name)

    $processes = (Invoke-Ado -Method GET -Path "work/processes").value
    $match = $processes | Where-Object { $_.name -eq $Name -and $_.customizationType -eq "system" }
    if (-not $match) {
        $available = ($processes | ForEach-Object { $_.name }) -join ", "
        throw "System process '$Name' not found in organization '$Organization'. Available: $available"
    }
    return $match.typeId
}

function Ensure-Process {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ReferenceName,
        [Parameter(Mandatory = $true)][string]$ParentProcessTypeId,
        [string]$Description = ""
    )

    $existing = (Invoke-Ado -Method GET -Path "work/processes").value |
        Where-Object { $_.name -eq $Name }

    if ($existing) {
        if ($existing.parentProcessTypeId -ne $ParentProcessTypeId) {
            throw "Process '$Name' exists but inherits from $($existing.parentProcessTypeId), not the expected $ParentProcessTypeId. A process's parent cannot be changed; rename or delete it first."
        }
        Write-Exists "process '$Name' ($($existing.typeId))"
        return $existing.typeId
    }

    $created = Invoke-Ado -Method POST -Path "work/processes" -Body @{
        name                = $Name
        referenceName       = $ReferenceName
        parentProcessTypeId = $ParentProcessTypeId
        description         = $Description
    }
    Write-Created "process '$Name' ($($created.typeId))"
    return $created.typeId
}

<#
    Picklists are organization-scoped, not process-scoped. Limits are 2048 lists per
    organization and 2048 items per list.

    An existing list is RECONCILED, not skipped. The field's name and type are
    permanent, but its values are not, and a run that returned early on the first
    version of a list meant every later value had to be added by hand in the web UI
    — which is how the script and the organization stop agreeing.

    Additive only, deliberately. Items present in the organization but absent from
    $Items are LEFT ALONE: work items already carry those values, and a picklist
    that drops one leaves those records holding a value their own field rejects.
    Retiring a value is a migration, not a provisioning run.
#>
function Ensure-PickList {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Items,
        [switch]$IsSuggested
    )

    $existing = (Invoke-Ado -Method GET -Path "work/processes/lists").value |
        Where-Object { $_.name -eq $Name }

    if ($existing) {
        # The list summary carries no items; only the detail read does.
        $detail = Invoke-Ado -Method GET -Path "work/processes/lists/$($existing.id)"
        $current = @($detail.items)
        $missing = @($Items | Where-Object { $current -notcontains $_ })

        if ($missing.Count -eq 0) {
            Write-Exists "picklist '$Name' ($($current.Count) items)"
            return $existing.id
        }

        # PUT replaces the whole list, so the body is current + missing, not missing.
        Invoke-Ado -Method PUT -Path "work/processes/lists/$($existing.id)" -Body @{
            id          = $existing.id
            name        = $Name
            type        = "String"
            items       = @($current + $missing)
            isSuggested = [bool]$IsSuggested
        } | Out-Null
        Write-Updated "picklist '$Name' (+$($missing -join ', '))"
        return $existing.id
    }

    $created = Invoke-Ado -Method POST -Path "work/processes/lists" -Body @{
        name        = $Name
        type        = "String"
        items       = $Items
        isSuggested = [bool]$IsSuggested
    }
    Write-Created "picklist '$Name' ($($Items.Count) items)"
    return $created.id
}

function Ensure-WorkItemType {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Description = "",
        [string]$Color = "60af49",
        [string]$Icon = "icon_book"
    )

    $existing = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/workitemtypes").value |
        Where-Object { $_.name -eq $Name }

    if ($existing) {
        Write-Exists "work item type '$Name' ($($existing.referenceName))"
        return $existing.referenceName
    }

    $created = Invoke-Ado -Method POST -Path "work/processes/$ProcessId/workitemtypes" -Body @{
        name         = $Name
        description  = $Description
        color        = $Color
        icon         = $Icon
        isDisabled   = $false
        inheritsFrom = $null
    }
    Write-Created "work item type '$Name' ($($created.referenceName))"
    return $created.referenceName
}

function Disable-InheritedWorkItemType {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $types = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/workitemtypes").value
    $wit = $types | Where-Object { $_.name -eq $Name }

    if (-not $wit) {
        Write-Exists "inherited type '$Name' not present; nothing to disable"
        return
    }
    if ($wit.isDisabled) {
        Write-Exists "work item type '$Name' already disabled"
        return
    }

    <#
        A type still marked `system` has no override in this process yet, so there
        is nothing to PATCH — the call answers "Cannot find work item type ... in
        process". Materialise an inherited copy instead, disabled from the start.
        `color` and `icon` are required on that POST even though only isDisabled is
        changing, so they are carried across from the system type.
    #>
    if ($wit.customization -eq "system") {
        Invoke-Ado -Method POST -Path "work/processes/$ProcessId/workitemtypes" -Body @{
            inheritsFrom = $wit.referenceName
            isDisabled   = $true
            color        = $wit.color
            icon         = $wit.icon
        } | Out-Null
    }
    else {
        Invoke-Ado -Method PATCH -Path "work/processes/$ProcessId/workitemtypes/$($wit.referenceName)" -Body @{
            isDisabled = $true
        } | Out-Null
    }
    Write-Created "disabled inherited work item type '$Name'"
}

<#
    The reverse of Disable-InheritedWorkItemType.

    `Issue` ships with Basic and this script used to disable it. It is now the record
    for a problem reported against a Solution, so it is switched back on.

    KNOWN AND ACCEPTED: `Issue` carries Basic's System.RequirementBacklogBehavior, and
    an inherited type cannot be detached from an inherited behavior. Re-enabling it
    therefore puts adopter-reported issues on the delivery backlog alongside Backlog
    Item. That was weighed against minting a permanent custom type and the permanent
    name was judged the higher price. See "Known gaps" in README.md.

    A type still marked `system` has no override to PATCH, so it is materialised the
    same way the disable path does — just enabled.
#>
function Enable-InheritedWorkItemType {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $types = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/workitemtypes").value
    $wit = $types | Where-Object { $_.name -eq $Name }

    if (-not $wit) {
        Write-Exists "inherited type '$Name' not present; nothing to enable"
        return
    }
    if (-not $wit.isDisabled) {
        Write-Exists "work item type '$Name' already enabled"
        return
    }

    if ($wit.customization -eq "system") {
        Invoke-Ado -Method POST -Path "work/processes/$ProcessId/workitemtypes" -Body @{
            inheritsFrom = $wit.referenceName
            isDisabled   = $false
            color        = $wit.color
            icon         = $wit.icon
        } | Out-Null
    }
    else {
        Invoke-Ado -Method PATCH -Path "work/processes/$ProcessId/workitemtypes/$($wit.referenceName)" -Body @{
            isDisabled = $false
        } | Out-Null
    }
    Write-Created "enabled inherited work item type '$Name'"
}

<#
    Custom fields in an inherited process are assigned a "Custom." reference-name
    prefix by the service. Pass the full reference name so re-runs match.

    The 7.1 "Fields - Add" reference documents only referenceName/defaultValue/
    allowGroups/allowedValues/readOnly/required in the request body, but a field
    that does not yet exist is created by supplying name and type alongside the
    reference name. If a future API version rejects that, the error surfaced by
    Invoke-Ado will say so plainly rather than failing silently.
#>
function Ensure-Field {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$WitRefName,
        [Parameter(Mandatory = $true)][string]$ReferenceName,
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("string", "integer", "dateTime", "plainText", "html", "double",
            "boolean", "identity", "picklistString", "picklistInteger", "picklistDouble")]
        [string]$Type = "string",
        [string]$Description = "",
        [string]$PickListId,
        [switch]$Required,
        [switch]$ReadOnly
    )

    <#
        The organization-level field API speaks a narrower type vocabulary than the
        process API: there is no "picklistString" there, and sending one is rejected
        with a bare "FieldTypeInvalid". A picklist-backed field is stored as an
        ordinary string; the picklist is a separate binding on the same definition.

        Computed up front because it is also the type that BOTH existence checks read
        back. Comparing a stored "string" against a requested "picklistString" made
        every re-run throw a false type-mismatch on exactly the fields that need one.
    #>
    $storageType = switch ($Type) {
        "picklistString" { "string" }
        "picklistInteger" { "integer" }
        "picklistDouble" { "double" }
        default { $Type }
    }

    $existing = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/workItemTypes/$WitRefName/fields").value |
        Where-Object { $_.referenceName -eq $ReferenceName }

    if ($existing) {
        if ($existing.type -and $existing.type -ne $storageType) {
            throw "Field '$ReferenceName' on $WitRefName is type '$($existing.type)' but the definition says '$storageType'. Field types are immutable in Azure DevOps; delete the field or change the definition."
        }
        Write-Exists "field $ReferenceName on $WitRefName"
        return
    }

    <#
        Two steps, not one. The Processes "Fields - Add" operation only ATTACHES an
        existing field to a work item type — passing name and type does not create
        one, and the call fails with "TF51535: Cannot find field <ref>". The field
        itself is an ORGANIZATION-level object created through the work item
        tracking API first.

        That split is also why the reference name is prefixed: it is claimed
        org-wide, in an organization shared with dozens of unrelated projects.
    #>
    $orgField = Invoke-Ado -Method GET -Path "wit/fields/$ReferenceName" -AllowNotFound
    if ($orgField) {
        if ($orgField.type -and $orgField.type -ne $storageType) {
            throw "Field '$ReferenceName' already exists organization-wide as type '$($orgField.type)' but the definition says '$storageType'. Field types are immutable; pick a different reference name."
        }
        <#
            The picklist binding is NOT retrofittable. Attaching with a pickList to a
            definition created as plain text silently succeeds and yields a free-text
            field, which is how this shipped as unconstrained the first time. Fail
            loudly instead: the only fix is to delete the definition and recreate it.
        #>
        if ($PickListId -and -not $orgField.isPicklist) {
            throw "Field '$ReferenceName' exists organization-wide as free text, but the definition asks for a picklist. The binding is set at creation and cannot be added later. Delete the field (remove it from every work item type first) and re-run."
        }
        Write-Exists "organization field $ReferenceName"
    }
    else {
        $body = @{
            name          = $Name
            referenceName = $ReferenceName
            type          = $storageType
            description   = $Description
            usage         = "workItem"
            readOnly      = [bool]$ReadOnly
            canSortBy     = $true
            isQueryable   = $true
        }
        # Must be set here. The process-level attach below accepts a pickList property
        # and returns 200 without it taking effect if the definition is not a picklist.
        if ($PickListId) {
            $body.isPicklist = $true
            $body.picklistId = $PickListId
        }

        Invoke-Ado -Method POST -Path "wit/fields" -Body $body | Out-Null
        Write-Created "organization field $ReferenceName ($storageType$(if ($PickListId) { ', picklist' }))"
    }

    $body = @{
        referenceName = $ReferenceName
        required      = [bool]$Required
        readOnly      = [bool]$ReadOnly
    }
    if ($PickListId) { $body.pickList = @{ id = $PickListId } }

    Invoke-Ado -Method POST -Path "work/processes/$ProcessId/workItemTypes/$WitRefName/fields" -Body $body | Out-Null
    Write-Created "field $ReferenceName attached to $WitRefName"
}

<#
    Only ONE state may occupy the Completed category per work item type. Adding a
    second one removes or hides the first, so the definitions below place exactly
    one state there deliberately.
#>
function Ensure-State {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$WitRefName,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)]
        [ValidateSet("Proposed", "InProgress", "Resolved", "Completed", "Removed")]
        [string]$StateCategory,
        [Parameter(Mandatory = $true)][int]$Order,
        [string]$Color = "b2b2b2"
    )

    $existing = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/workItemTypes/$WitRefName/states").value |
        Where-Object { $_.name -eq $Name }

    if ($existing) {
        if ($existing.stateCategory -ne $StateCategory) {
            throw "State '$Name' on $WitRefName is in category '$($existing.stateCategory)' but the definition says '$StateCategory'. State categories are immutable; delete the state or change the definition."
        }
        Write-Exists "state '$Name' on $WitRefName"
        return $existing.id
    }

    $created = Invoke-Ado -Method POST -Path "work/processes/$ProcessId/workItemTypes/$WitRefName/states" -Body @{
        name          = $Name
        color         = $Color
        stateCategory = $StateCategory
        order         = $Order
    }
    Write-Created "state '$Name' ($StateCategory) on $WitRefName"
    return $created.id
}

function Hide-State {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$WitRefName,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $state = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/workItemTypes/$WitRefName/states").value |
        Where-Object { $_.name -eq $Name }

    if (-not $state) {
        Write-Exists "state '$Name' not present on $WitRefName; nothing to hide"
        return
    }
    if ($state.hidden) {
        Write-Exists "state '$Name' already hidden on $WitRefName"
        return
    }

    Invoke-Ado -Method PUT -Path "work/processes/$ProcessId/workItemTypes/$WitRefName/states/$($state.id)" -Body @{
        hidden = $true
    } | Out-Null
    Write-Created "hid inherited state '$Name' on $WitRefName"
}

<#
    Replace a custom work item type's workflow.

    A new custom WIT inherits Basic's To do (Proposed, 1) / Doing (InProgress, 2) /
    Done (Completed, 3), and Azure DevOps validates that every Proposed state sorts
    before every In Progress state, which sorts before Completed. So states cannot
    simply be added at convenient orders and the defaults hidden afterwards — the
    invariant has to hold after each individual call.

    The sequence below is the one that never breaks it:

      hide Done            -> To do(P,1), Doing(IP,2)
      add In Progress      -> ..., mine(IP,50)          (needs Done gone first)
      hide Doing           -> To do(P,1), mine(IP,50)
      add Proposed         -> mine(P,10..30), mine(IP,50)
      hide To do           -> only ours remain
      add Completed        -> ..., mine(C,100)
      add Removed          -> ..., mine(R,200)

    Also note only ONE state may occupy the Completed category, which is why the
    definitions below put exactly one there.
#>
$script:CategoryRank = @{ Proposed = 0; InProgress = 1; Resolved = 2; Completed = 3; Removed = 4 }

function Set-Workflow {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$WitRefName,
        [Parameter(Mandatory = $true)][array]$States   # @{ Name; Category; Color }
    )

    $path = "work/processes/$ProcessId/workItemTypes/$WitRefName/states"
    $current = { (Invoke-Ado -Method GET -Path $path).value }

    function Add-StateAt {
        param([string]$Name, [string]$Category, [string]$Color)

        $existing = & $current
        if ($existing | Where-Object { $_.name -eq $Name }) {
            Write-Exists "state '$Name' on $WitRefName"
            return
        }

        # Azure DevOps keeps states in one compact 1..N sequence and renumbers on
        # every insert, so `order` is a target POSITION, not a spaced sort key.
        # The position is "after everything in an earlier or equal category".
        $rank = $script:CategoryRank[$Category]
        $position = 1 + @($existing | Where-Object { $script:CategoryRank[$_.stateCategory] -le $rank }).Count

        Invoke-Ado -Method POST -Path $path -Body @{
            name          = $Name
            stateCategory = $Category
            order         = $position
            color         = $Color
        } | Out-Null
        Write-Created "state '$Name' ($Category) on $WitRefName"
    }

    # Completed first: a WIT must have a Completed state AT ALL TIMES, so Basic's
    # "Done" cannot be removed up front. Adding our own displaces it instead —
    # only one state may occupy that category.
    foreach ($category in @("Completed", "Removed", "Proposed", "InProgress")) {
        foreach ($s in ($States | Where-Object { $_.Category -eq $category })) {
            Add-StateAt -Name $s.Name -Category $s.Category -Color $s.Color
        }
    }

    # Now that ours exist, Basic's leftovers can go. These are `custom` states on a
    # custom work item type, so they are DELETED — hiding is for inherited states.
    foreach ($default in @("To do", "Doing", "Done")) {
        $state = (& $current) | Where-Object { $_.name -eq $default }
        if (-not $state) { continue }
        Invoke-Ado -Method DELETE -Path "$path/$($state.id)" | Out-Null
        Write-Created "removed Basic default state '$default' from $WitRefName"
    }
}

<#
    Resolve a group's origin id.

    A group-membership rule condition takes the group's vsId — a GUID — not the
    "[Org]\Group Name" display form, which fails with "Unrecognized value ... for
    property vsId". Resolving by name at run time keeps the definitions below
    readable and portable to another organization.

    Graph lives on the vssps host, so it does not go through Invoke-Ado.
#>
function Get-GroupOriginId {
    param([Parameter(Mandatory = $true)][string]$PrincipalName)

    $uri = "https://vssps.dev.azure.com/$Organization/_apis/graph/groups?api-version=7.1-preview.1"
    $groups = (Invoke-RestMethod -Uri $uri -Headers $script:AuthHeader).value
    $match = $groups | Where-Object { $_.principalName -eq $PrincipalName }

    if (-not $match) {
        throw "Group '$PrincipalName' not found in organization '$Organization'. Create it before provisioning the process, or pass a different -ApproverGroup / -AdministratorGroup."
    }
    return $match.originId
}

function Ensure-Rule {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$WitRefName,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][array]$Conditions,
        [Parameter(Mandatory = $true)][array]$Actions
    )

    $existing = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/workItemTypes/$WitRefName/rules").value |
        Where-Object { $_.name -eq $Name }

    if ($existing) {
        Write-Exists "rule '$Name' on $WitRefName"
        return
    }

    Invoke-Ado -Method POST -Path "work/processes/$ProcessId/workItemTypes/$WitRefName/rules" -Body @{
        name       = $Name
        conditions = $Conditions
        actions    = $Actions
        isDisabled = $false
    } | Out-Null
    Write-Created "rule '$Name' on $WitRefName"
}

<#
    Backlog levels are "behaviors". Inherited levels cannot be removed or reordered
    and a work item type may belong to only one of them, so Idea takes the portfolio
    level Basic calls Epics and Backlog Item takes the requirement level.
#>
function Set-BacklogBehavior {
    param(
        [Parameter(Mandatory = $true)][string]$ProcessId,
        [Parameter(Mandatory = $true)][string]$WitRefName,
        [Parameter(Mandatory = $true)][string]$BehaviorName,
        [switch]$IsDefault
    )

    $behavior = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/behaviors").value |
        Where-Object { $_.name -eq $BehaviorName }

    if (-not $behavior) {
        $available = ((Invoke-Ado -Method GET -Path "work/processes/$ProcessId/behaviors").value |
            ForEach-Object { $_.name }) -join ", "
        throw "Behavior (backlog level) '$BehaviorName' not found. Available: $available"
    }

    # A behavior is identified by its referenceName, not an `id` property — there
    # is no `id`, so sending one yields "missing a parameter. Parameter name: Id".
    $behaviorId = $behavior.referenceName

    $assigned = (Invoke-Ado -Method GET -Path "work/processes/$ProcessId/workitemtypesbehaviors/$WitRefName/behaviors" -AllowNotFound)
    if ($assigned -and ($assigned.value | Where-Object { $_.behavior.id -eq $behaviorId })) {
        Write-Exists "$WitRefName on backlog '$BehaviorName'"
        return
    }

    Invoke-Ado -Method POST -Path "work/processes/$ProcessId/workitemtypesbehaviors/$WitRefName/behaviors" -Body @{
        behavior  = @{ id = $behaviorId }
        isDefault = [bool]$IsDefault
    } | Out-Null
    Write-Created "$WitRefName on backlog '$BehaviorName'"
}

# ---------------------------------------------------------------------------
# Process
# ---------------------------------------------------------------------------

Write-Step "Resolving the Basic system process..."
$basicId = Get-SystemProcessId -Name "Basic"
Write-Host "  Basic process id: $basicId" -ForegroundColor DarkGray

Write-Step "Ensuring the inherited process..."
$processId = Ensure-Process `
    -Name $ProcessName `
    -ReferenceName $ProcessReferenceName `
    -ParentProcessTypeId $basicId `
    -Description "Innovation Backlog: ideas, reusable solutions, and the delivery work they become."

# ---------------------------------------------------------------------------
# Picklists
# ---------------------------------------------------------------------------

Write-Step "Ensuring picklists..."

<#
    Solution type is a real field, not a tag.

    Visibility and pipeline health ride on tags because they are descriptive. The
    solution type is not: it decides what the record CONSISTS OF — a Strategy has
    no repository, a Custom solution does — and the intake form is generated from
    it. A structural discriminator cannot be free text that anyone can mistype or
    clear from the work item form, so it gets a constrained picklist that also
    renders as a proper dropdown and can be grouped on a board.

    Keep these values in step with SOLUTION_KINDS in
    packages/logic/src/domain/solution.ts, which is the source of truth for what
    each kind requires — and with SolutionType in
    src/Momentum.Library/Momentum.Library.Domain/Solutions/SolutionStatus.cs.

    "Skill" is provisioned but hidden at intake: SOLUTION_KINDS marks it `hidden` so
    the picker does not offer it. The value is claimed here first because a picklist
    value can be added at any time while the field's name and type cannot change —
    so the cheap half is done early and the form follows when skill intake is wired
    to it. Nothing writes the value yet; it costs one string in a list of two.
#>
$solutionTypeListId = Ensure-PickList -Name "Innovation Backlog Solution Type" -Items @(
    "Strategy", "CustomSolution", "Skill"
)

# ---------------------------------------------------------------------------
# Tags, not fields
# ---------------------------------------------------------------------------

# An earlier draft backed visibility and pipeline health with custom fields too.
# Both are descriptive rather than structural, so both are native:
#
#   visibility      -> System.AreaPath (which is also what ENFORCES it)
#   pipeline status -> a "pipeline:" prefixed System.Tags entry
#
# Prefixed tags stay queryable ([System.Tags] CONTAINS 'type:Library'), show on
# cards, and are distinguishable from the domain's own topic tags — without
# claiming org-wide picklist or field names in an organization shared by 43
# projects.

# ---------------------------------------------------------------------------
# Idea
# ---------------------------------------------------------------------------

Write-Step "Ensuring the Idea work item type..."

# Icon ids come from a fixed set of 44; GET _apis/wit/workitemicons lists them.
# There is no plain lightbulb — only icon_broken_lightbulb — hence icon_star.
$idea = Ensure-WorkItemType -ProcessId $processId -Name "Idea" `
    -Description "Something the organization needs. Carries its whole lifecycle in State." `
    -Color "8f7ee7" -Icon "icon_star"

Set-Workflow -ProcessId $processId -WitRefName $idea -States @(
    @{ Name = "Draft";             Category = "Proposed";   Color = "b2b2b2" }
    @{ Name = "Triage";            Category = "Proposed";   Color = "b2b2b2" }
    @{ Name = "Awaiting Approval"; Category = "Proposed";   Color = "f2cb1d" }
    @{ Name = "Accepted";          Category = "InProgress"; Color = "007acc" }
    @{ Name = "Published";         Category = "Completed";  Color = "339947" }
    @{ Name = "Rejected";          Category = "Removed";    Color = "e60017" }
)

# One custom field, and only one. A process rule can make a FIELD required on a
# state transition but cannot require a comment, so this is the only place where a
# custom field buys something the platform cannot otherwise enforce. Everything
# else an idea needs is native:
#
#   who decided / when  -> System.ChangedBy / System.ChangedDate on the revision
#   visibility          -> System.AreaPath
#   triage health       -> "pipeline:" tag
#   failure detail      -> a work item comment
#   canonical solution  -> the Related link's own comment
Ensure-Field -ProcessId $processId -WitRefName $idea -ReferenceName "Custom.InnovationBacklogDecisionRationale" `
    -Name "Decision Rationale" -Type plainText `
    -Description "Why an approver accepted or rejected this item. Required on the decision transition."

# ---------------------------------------------------------------------------
# Solution
# ---------------------------------------------------------------------------

Write-Step "Ensuring the Solution work item type..."

$solution = Ensure-WorkItemType -ProcessId $processId -Name "Solution" `
    -Description "A reusable solution in the catalog. Not delivery work; it has no backlog level." `
    -Color "60af49" -Icon "icon_gift"

Set-Workflow -ProcessId $processId -WitRefName $solution -States @(
    @{ Name = "Awaiting Approval"; Category = "Proposed";   Color = "f2cb1d" }
    @{ Name = "Published";         Category = "InProgress"; Color = "339947" }
    @{ Name = "Retired";           Category = "Completed";  Color = "b2b2b2" }
    @{ Name = "Rejected";          Category = "Removed";    Color = "e60017" }
)

# Two fields on a solution. Everything else is native:
#
#   owner            -> System.AssignedTo
#   published when   -> the revision where State became Published
#   repository, demo -> native Hyperlink relations, told apart by their comment
Ensure-Field -ProcessId $processId -WitRefName $solution -ReferenceName "Custom.InnovationBacklogDecisionRationale" `
    -Name "Decision Rationale" -Type plainText `
    -Description "Why an approver accepted or rejected this item. Required on the decision transition."

# Structural, not descriptive: this decides whether the solution has a repository
# at all, and the intake form is generated from it. Hence a constrained picklist
# rather than a tag anyone could mistype or clear.
Ensure-Field -ProcessId $processId -WitRefName $solution -ReferenceName "Custom.InnovationBacklogSolutionType" `
    -Name "Solution Type" -Type picklistString -PickListId $solutionTypeListId -Required `
    -Description "Strategy has no repository, only a worked example. CustomSolution is something built."
# ---------------------------------------------------------------------------
# Backlog Item
# ---------------------------------------------------------------------------

Write-Step "Ensuring the Backlog Item work item type..."

# Deliberately NOT a published copy of an Idea. An Idea carries its own lifecycle
# through to Published; a Backlog Item is the delivery record created when someone
# commits to building it, so the two are never duplicates of one another.
$backlogItem = Ensure-WorkItemType -ProcessId $processId -Name "Backlog Item" `
    -Description "Delivery work for an accepted Idea. Child of the Idea it implements." `
    -Color "009ccc" -Icon "icon_clipboard"

# No fields at all. A Backlog Item's link to the Idea it implements is a native
# Parent link, which Basic already provides and which the boards understand.

# ---------------------------------------------------------------------------
# Milestone
# ---------------------------------------------------------------------------

Write-Step "Ensuring the Milestone work item type..."

# The roadmap a Solution publishes to the people adopting it. Like Solution, it takes
# no backlog behavior below: a promise about a catalog entry is not delivery work.
#
# Distinct from the "milestones" in docs/design/capabilities/momentum, which are
# achievement thresholds crossed by events and are correctly DERIVED. This is a plan,
# and nothing can derive a plan.
$milestone = Ensure-WorkItemType -ProcessId $processId -Name "Milestone" `
    -Description "A dated commitment on a Solution's roadmap. Child of the Solution." `
    -Color "e5731a" -Icon "icon_trophy"

# Cancelled is not cosmetic. The Azure DevOps client has no DELETE verb, and
# destroying a work item is a heavier act than dropping a line from a roadmap, so
# removing a milestone moves it here and the list query filters it out.
Set-Workflow -ProcessId $processId -WitRefName $milestone -States @(
    @{ Name = "Planned";     Category = "Proposed";   Color = "b2b2b2" }
    @{ Name = "In progress"; Category = "InProgress"; Color = "007acc" }
    @{ Name = "Shipped";     Category = "Completed";  Color = "339947" }
    @{ Name = "Cancelled";   Category = "Removed";    Color = "e60017" }
)

# An EXISTING organization field, verified present in this org. Ensure-Field takes
# its "exists org-wide" branch and only attaches it to the type, so no new
# permanent name is claimed in an organization shared with dozens of projects.
Ensure-Field -ProcessId $processId -WitRefName $milestone `
    -ReferenceName "Microsoft.VSTS.Scheduling.TargetDate" -Name "Target Date" -Type dateTime `
    -Description "First day of the target period. Orders the roadmap."

# What the roadmap PRINTS, and the one new org-wide name this feature claims.
#
# A date cannot express granularity: "Q4 2026" is a quarter and "Sep 2026" is a
# month, and no instant tells them apart. A string alone cannot be sorted — "Q4 2026"
# precedes "Sep 2026" lexically. So the date orders and this labels, and neither is
# asked to do the other's job. Empty means "format the target date".
Ensure-Field -ProcessId $processId -WitRefName $milestone `
    -ReferenceName "Custom.InnovationBacklogTargetLabel" -Name "Target Label" -Type string `
    -Description "How the target reads on the roadmap: 'Q4 2026', 'Sep 2026'. Empty formats Target Date."

# No fields for the note: System.Description already carries it, in keeping with the
# native-first discipline recorded at the top of this file.

# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

Write-Step "Ensuring approval rules..."

<#
    The approver gate. Inherited-process rules can make a field read-only for users
    outside a group, which is the only mechanism available for gating a transition.

    Note the side effect recorded in the plan: this makes State read-only for
    everyone outside Approvers, so a submitter cannot move their own idea from Draft
    to Triage either. That transition is driven by the app or a Flow.
#>
# The condition carries the group's GUID, not its name.
$approverGroupId = Get-GroupOriginId -PrincipalName $ApproverGroup
Write-Host "  Approver group: $ApproverGroup -> $approverGroupId" -ForegroundColor DarkGray

# The decision states differ per type: an idea is Accepted, a solution is
# Published. A rule naming a state the work item type does not have is rejected
# with "Unrecognized value '<state>' for property condition.value", so these are
# declared per type rather than looped over both.
# States that record a decision, and so require a rationale.
$decisionStates = @{
    $idea     = @("Accepted", "Rejected")
    $solution = @("Published", "Rejected")
}

# States only an approver may set. A superset of the above: the terminal states
# (an idea reaching Published, a solution being Retired) are outcomes too, even
# though they carry no fresh rationale of their own.
$approverOnlyStates = @{
    $idea     = @("Accepted", "Published", "Rejected")
    $solution = @("Published", "Retired", "Rejected")
}

foreach ($wit in @($idea, $solution)) {
    <#
        Disallow the DECISION states for non-approvers, rather than making
        System.State read-only.

        Read-only was too blunt and broke creation outright: Azure DevOps applies
        the default state as part of the create, so a read-only State field fails
        with "TF401320: Rule Error for field State ... Required, ReadOnly,
        InvalidEmpty" before a submitter can file anything at all. It also blocked
        a submitter moving their own idea Draft -> Triage, which was never the
        intent.

        The intent is "only approvers may DECIDE". Disallowing exactly the decision
        values says that and nothing more: everyone can create and advance an item
        through the pre-decision states, and only an approver can land it on one
        that means a decision was made.
    #>
    Ensure-Rule -ProcessId $processId -WitRefName $wit `
        -Name "Only approvers may decide" `
        -Conditions @(
            @{ conditionType = "whenCurrentUserIsNotMemberOfGroup"; value = $approverGroupId }
        ) `
        -Actions @(
            $approverOnlyStates[$wit] | ForEach-Object {
                @{ actionType = "disallowValue"; targetField = "System.State"; value = $_ }
            }
        )

    # `when` rather than a transition condition: the rationale must be present
    # whenever the item sits in a decided state, not only on the hop into it.
    foreach ($state in $decisionStates[$wit]) {
        Ensure-Rule -ProcessId $processId -WitRefName $wit `
            -Name "Rationale required when $($state.ToLower())" `
            -Conditions @(
                @{ conditionType = "when"; field = "System.State"; value = $state }
            ) `
            -Actions @(
                @{ actionType = "makeRequired"; targetField = "Custom.InnovationBacklogDecisionRationale" }
            )
    }

    # Visibility has no rule because it has no field. It is System.AreaPath, and
    # who may move an item between area paths is an area-path permission — set by
    # Provision-AdoProject.ps1 — not something a process rule needs to restate.
    # One mechanism, enforced in one place.
}

# ---------------------------------------------------------------------------
# Backlog levels
# ---------------------------------------------------------------------------

Write-Step "Assigning backlog levels..."

# Basic's levels are Epics > Issues > Tasks. Idea takes the portfolio level and
# Backlog Item the requirement level; Solution and Milestone stay off the backlogs
# entirely because a catalog entry is not work, and neither is a promise about one.
Set-BacklogBehavior -ProcessId $processId -WitRefName $idea -BehaviorName "Epics" -IsDefault
Set-BacklogBehavior -ProcessId $processId -WitRefName $backlogItem -BehaviorName "Issues" -IsDefault

Write-Step "Disabling unused inherited types..."
Disable-InheritedWorkItemType -ProcessId $processId -Name "Epic"

# Issue is the record for a problem reported against a Solution — see the note on
# Enable-InheritedWorkItemType for the backlog trade-off this accepts.
Write-Step "Enabling the Issue work item type..."
Enable-InheritedWorkItemType -ProcessId $processId -Name "Issue"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Process provisioning complete." -ForegroundColor Green
Write-Host ""
Write-Host "Pass this to Provision-AdoProject.ps1:" -ForegroundColor Cyan
Write-Host "  -ProcessId $processId"
Write-Host ""

[PSCustomObject]@{
    Organization        = $Organization
    ProcessId           = $processId
    ProcessName         = $ProcessName
    IdeaRefName         = $idea
    SolutionRefName     = $solution
    BacklogItemRefName  = $backlogItem
    MilestoneRefName    = $milestone
}
