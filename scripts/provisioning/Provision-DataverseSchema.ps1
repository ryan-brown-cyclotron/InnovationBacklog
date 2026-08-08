#Requires -Version 7.0
<#
.SYNOPSIS
    Provisions the Dataverse schema for the Innovation Backlog code app.
.DESCRIPTION
    Creates the publisher, an unmanaged solution, the global choices, the engagement
    tables, their alternate keys, and the runtime environment variables.

    Only what Azure DevOps genuinely cannot hold lives here: votes, adoptions,
    participation requests, the activity feed and the engagement rollup. Comments
    are NOT here — they are native ADO work item comments. See the note where the
    comment table used to be.

    Idempotent: every Ensure-* helper reads before it writes.

    IMMUTABILITY WARNING. Dataverse schema names are permanent. The helpers fail
    loudly when an existing component disagrees with the definition rather than
    attempting a rename.

    Self-contained by design: it needs only a bearer token, from the Azure CLI or Az
    PowerShell. Microsoft publishes reusable Web API helpers in PowerApps-Samples
    (dataverse/webapi/PS), but vendoring that repo is a heavier dependency than the
    eight request shapes this script actually needs, and the rest of scripts/ is
    self-contained.
.PARAMETER EnvironmentUrl
    Dataverse environment URL, e.g. https://contoso.crm.dynamics.com/
.PARAMETER Prefix
    Publisher customization prefix. Permanent once components exist.
.PARAMETER AdoOrgId
    Azure DevOps organization, from Provision-AdoProject.ps1. When supplied, the
    matching environment variable VALUE row is created as well as the definition.
.PARAMETER AdoProjectId
    Azure DevOps project id, from Provision-AdoProject.ps1.
.PARAMETER AccessToken
    A Dataverse bearer token. Omit it and the script finds one itself, preferring the
    Azure CLI (which the rest of scripts/ already depends on) and falling back to the
    Az PowerShell module. Neither needs to be interactive if you are already signed in.
.EXAMPLE
    az login   # once, if not already signed in
    .\Provision-DataverseSchema.ps1 -EnvironmentUrl https://org9ceb01a6.crm.dynamics.com/ `
        -AdoOrgId contoso -AdoProjectId 8f1c...
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentUrl,

    [ValidatePattern('^[a-z][a-z0-9]{1,7}$')]
    [string]$Prefix = "cycai",

    [string]$PublisherName = "Cyclotron AI",

    [string]$SolutionName = "InnovationBacklog",

    [string]$SolutionDisplayName = "Innovation Backlog",

    [string]$AdoOrgId,

    [string]$AdoProjectId,

    [string]$AccessToken
)

$ErrorActionPreference = "Stop"

$script:Resource = $EnvironmentUrl.TrimEnd("/")
$script:ApiRoot = "$script:Resource/api/data/v9.2"
$script:SolutionUniqueName = $SolutionName

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

<#
    Three token sources, in order of preference:

      1. -AccessToken, for CI where a token is minted upstream.
      2. Azure CLI. scripts/setup-spfx-deployment-identity.ps1 already requires `az`,
         and `az login` persists, so this is usually non-interactive.
      3. Az PowerShell, for machines that have the module but not the CLI.

    Whichever is used, the token must be scoped to the environment URL itself —
    Dataverse is its own resource, not Azure Resource Manager.
#>
function Get-DataverseToken {
    param([Parameter(Mandatory = $true)][string]$Resource)

    if (Get-Command az -ErrorAction SilentlyContinue) {
        $token = az account get-access-token --resource $Resource --query accessToken -o tsv 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($token)) {
            $account = (az account show --query user.name -o tsv 2>$null)
            Write-Host "Authenticated via Azure CLI as $account" -ForegroundColor DarkGray
            return $token.Trim()
        }
    }

    if (Get-Module -ListAvailable -Name Az.Accounts) {
        Import-Module Az.Accounts -ErrorAction Stop
        $context = Get-AzContext
        if ($context) {
            $result = Get-AzAccessToken -ResourceUrl $Resource
            # Az 12+ returns a SecureString; earlier versions a plain string.
            $value = if ($result.Token -is [System.Security.SecureString]) {
                [System.Net.NetworkCredential]::new("", $result.Token).Password
            }
            else { $result.Token }
            Write-Host "Authenticated via Az PowerShell as $($context.Account.Id)" -ForegroundColor DarkGray
            return $value
        }
    }

    throw "No Dataverse credential. Run 'az login', or 'Connect-AzAccount', or pass -AccessToken."
}

$script:AccessToken = if ($AccessToken) { $AccessToken } else { Get-DataverseToken -Resource $script:Resource }
Write-Host "Target environment: $EnvironmentUrl" -ForegroundColor DarkGray

function Write-Created { param([string]$Message) Write-Host "  Created $Message" -ForegroundColor Green }
function Write-Exists { param([string]$Message) Write-Host "  Exists  $Message" -ForegroundColor DarkGray }
function Write-Step { param([string]$Message) Write-Host $Message -ForegroundColor Cyan }

# ---------------------------------------------------------------------------
# REST plumbing
# ---------------------------------------------------------------------------

<#
    Components created while the MSCRM.SolutionUniqueName header is set are added to
    that solution, which is what makes the schema exportable and promotable
    dev -> test -> prod. Without it every component lands in the Default solution
    and cannot be moved cleanly.
#>
function Invoke-Dataverse {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body,
        [switch]$InSolution,
        [switch]$AllowNotFound,
        # Dataverse answers a POST with 204 No Content and the new id in an
        # OData-EntityId header. Ask for the row back when the caller needs its id.
        [switch]$ReturnRecord
    )

    $headers = @{
        Authorization    = "Bearer $script:AccessToken"
        Accept           = "application/json"
        "OData-Version"  = "4.0"
        "OData-MaxVersion" = "4.0"
    }
    if ($InSolution.IsPresent) {
        $headers["MSCRM.SolutionUniqueName"] = $script:SolutionUniqueName
    }
    if ($ReturnRecord.IsPresent) {
        $headers["Prefer"] = "return=representation"
    }

    $params = @{
        Method      = $Method
        Uri         = "$script:ApiRoot/$Path"
        Headers     = $headers
        ContentType = "application/json; charset=utf-8"
    }
    if ($null -ne $Body) {
        $ordered = ConvertTo-ODataOrdered -Value $Body
        $params.Body = ([Text.Encoding]::UTF8.GetBytes(($ordered | ConvertTo-Json -Depth 20)))
    }

    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            return Invoke-RestMethod @params
        }
        catch {
            $response = $_.Exception.Response
            $status = if ($response) { [int]$response.StatusCode } else { 0 }

            if ($status -eq 404 -and $AllowNotFound.IsPresent) { return $null }

            # Dataverse service protection limits: 6000 requests / 5 min / user.
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

function New-Label {
    param([string]$Text)
    return @{
        LocalizedLabels = @(@{ Label = $Text; LanguageCode = 1033 })
    }
}

<#
    Hoist "@odata.type" to the front of every object, recursively.

    PowerShell hashtables are unordered, so ConvertTo-Json emits keys in whatever
    order the hash table iterates. OData needs the type discriminator to come first
    to resolve a derived type, so a payload that works on one run fails on the next
    with nothing more useful than "An unexpected error occurred". Normalizing here
    means no call site has to remember to use [ordered].
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

    # Strings are enumerable; treat them as scalars.
    if ($Value -is [string]) { return $Value }

    if ($Value -is [System.Collections.IEnumerable]) {
        # The leading comma matters. PowerShell unwraps a single-element array on
        # return, which would turn "LocalizedLabels": [{...}] into "LocalizedLabels":
        # {...} and earn a null-collection error from OData.
        return , @($Value | ForEach-Object { ConvertTo-ODataOrdered -Value $_ })
    }

    return $Value
}

# ---------------------------------------------------------------------------
# Publisher and solution
# ---------------------------------------------------------------------------

function Ensure-Publisher {
    param(
        [Parameter(Mandatory = $true)][string]$UniqueName,
        [Parameter(Mandatory = $true)][string]$FriendlyName,
        [Parameter(Mandatory = $true)][string]$CustomizationPrefix,
        [int]$OptionValuePrefix = 10000
    )

    $existing = (Invoke-Dataverse -Method GET `
            -Path "publishers?`$filter=uniquename eq '$UniqueName'&`$select=publisherid,customizationprefix").value

    if ($existing -and $existing.Count -gt 0) {
        if ($existing[0].customizationprefix -ne $CustomizationPrefix) {
            throw "Publisher '$UniqueName' exists with prefix '$($existing[0].customizationprefix)' but the definition says '$CustomizationPrefix'. A publisher prefix cannot be changed once components use it."
        }
        Write-Exists "publisher '$UniqueName' (prefix $CustomizationPrefix)"
        return $existing[0].publisherid
    }

    $created = Invoke-Dataverse -Method POST -Path "publishers?`$select=publisherid" -ReturnRecord -Body @{
        uniquename                    = $UniqueName
        friendlyname                  = $FriendlyName
        customizationprefix           = $CustomizationPrefix
        customizationoptionvalueprefix = $OptionValuePrefix
    }
    Write-Created "publisher '$UniqueName' (prefix $CustomizationPrefix)"
    return $created.publisherid
}

function Ensure-Solution {
    param(
        [Parameter(Mandatory = $true)][string]$UniqueName,
        [Parameter(Mandatory = $true)][string]$FriendlyName,
        [Parameter(Mandatory = $true)][string]$PublisherId
    )

    $existing = (Invoke-Dataverse -Method GET `
            -Path "solutions?`$filter=uniquename eq '$UniqueName'&`$select=solutionid").value

    if ($existing -and $existing.Count -gt 0) {
        Write-Exists "solution '$UniqueName'"
        return $existing[0].solutionid
    }

    $created = Invoke-Dataverse -Method POST -Path "solutions?`$select=solutionid" -ReturnRecord -Body @{
        uniquename                          = $UniqueName
        friendlyname                        = $FriendlyName
        version                             = "1.0.0.0"
        "publisherid@odata.bind"            = "/publishers($PublisherId)"
    }
    Write-Created "solution '$UniqueName'"
    return $created.solutionid
}

# ---------------------------------------------------------------------------
# Global choices
# ---------------------------------------------------------------------------

<#
    Option VALUES are assigned by Dataverse inside the publisher's option value
    prefix range rather than specified here, so they stay consistent with the
    publisher and do not collide. The bridge translates name <-> value through one
    choice registry; the resulting mappings are printed at the end of this script so
    that registry can be written from real values.
#>
function Ensure-GlobalChoice {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string[]]$Options
    )

    $existing = Invoke-Dataverse -Method GET `
        -Path "GlobalOptionSetDefinitions(Name='$Name')" -AllowNotFound

    if ($existing) {
        Write-Exists "global choice '$Name'"
        return
    }

    Invoke-Dataverse -Method POST -Path "GlobalOptionSetDefinitions" -InSolution -Body @{
        "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"
        Name          = $Name
        DisplayName   = (New-Label $DisplayName)
        OptionSetType = "Picklist"
        IsGlobal      = $true
        Options       = @($Options | ForEach-Object { @{ Label = (New-Label $_) } })
    } | Out-Null

    Write-Created "global choice '$Name' ($($Options.Count) options)"
}

<#
    A choice column binds to its global choice by MetadataId. `Name='...'` is a valid
    key for reading a global option set but not for @odata.bind, which answers a
    name key with "Guid should contain 32 digits with 4 dashes".
#>
function Get-GlobalChoiceId {
    param([Parameter(Mandatory = $true)][string]$Name)

    $definition = Invoke-Dataverse -Method GET `
        -Path "GlobalOptionSetDefinitions(Name='$Name')?`$select=MetadataId" -AllowNotFound
    if (-not $definition -or -not $definition.MetadataId) {
        throw "Global choice '$Name' not found; it must be created before a column can bind to it."
    }
    return $definition.MetadataId
}

# ---------------------------------------------------------------------------
# Tables and columns
# ---------------------------------------------------------------------------

<#
    User-owned so that ownerid, and therefore Dataverse row-level security, applies.
    That is what lets a vote be attributed to a person and a restricted row be
    scoped by team, without a custom "owner" column.
#>
function Ensure-Table {
    param(
        [Parameter(Mandatory = $true)][string]$LogicalName,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string]$DisplayCollectionName,
        [string]$Description = "",
        # Must not match any other column's display name on the same table —
        # Dataverse rejects duplicates with a bare "An unexpected error occurred".
        [string]$PrimaryColumnDisplayName = "Name"
    )

    $existing = Invoke-Dataverse -Method GET `
        -Path "EntityDefinitions(LogicalName='$LogicalName')?`$select=LogicalName" -AllowNotFound

    if ($existing) {
        Write-Exists "table $LogicalName"
        return
    }

    Invoke-Dataverse -Method POST -Path "EntityDefinitions" -InSolution -Body @{
        "@odata.type"         = "Microsoft.Dynamics.CRM.EntityMetadata"
        SchemaName            = $LogicalName
        DisplayName           = (New-Label $DisplayName)
        DisplayCollectionName = (New-Label $DisplayCollectionName)
        Description           = (New-Label $Description)
        OwnershipType         = "UserOwned"
        IsActivity            = $false
        HasNotes              = $true      # annotation: comment attachments live here
        HasActivities         = $false
        Attributes            = @(
            @{
                "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
                # Attribute names are scoped per table, so every table can use <prefix>_name.
                SchemaName    = "$($Prefix)_name"
                DisplayName   = (New-Label $PrimaryColumnDisplayName)
                IsPrimaryName = $true
                MaxLength     = 200
                RequiredLevel = @{ Value = "ApplicationRequired" }
                FormatName    = @{ Value = "Text" }
            }
        )
    } | Out-Null

    Write-Created "table $LogicalName"
    Wait-TableReady -LogicalName $LogicalName
}

<#
    A table is not ready for columns the instant its POST returns. Adding an attribute
    immediately afterwards fails with a bare "An unexpected error occurred", and the
    identical request succeeds moments later — so the failure says nothing about the
    payload and retrying is the only cure.

    Poll the definition, then settle briefly. Only runs on the create path, so a
    re-run of an already-provisioned environment pays nothing.
#>
function Wait-TableReady {
    param(
        [Parameter(Mandatory = $true)][string]$LogicalName,
        [int]$TimeoutSeconds = 120
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        $definition = Invoke-Dataverse -Method GET `
            -Path "EntityDefinitions(LogicalName='$LogicalName')?`$select=MetadataId" -AllowNotFound
        if ($definition -and $definition.MetadataId) {
            Start-Sleep -Seconds 5   # metadata publish lags the definition being readable
            return
        }
    }
    throw "Table $LogicalName did not become ready within $TimeoutSeconds seconds."
}

function Test-ColumnExists {
    param([string]$Table, [string]$Column)
    $found = Invoke-Dataverse -Method GET `
        -Path "EntityDefinitions(LogicalName='$Table')/Attributes(LogicalName='$Column')?`$select=LogicalName" `
        -AllowNotFound
    return $null -ne $found
}

function Ensure-StringColumn {
    param(
        [Parameter(Mandatory = $true)][string]$Table,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [int]$MaxLength = 200,
        [string]$Description = "",
        [switch]$Required
    )

    if (Test-ColumnExists -Table $Table -Column $Name) { Write-Exists "$Table.$Name"; return }

    Invoke-Dataverse -Method POST -Path "EntityDefinitions(LogicalName='$Table')/Attributes" -InSolution -Body @{
        "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
        SchemaName    = $Name
        DisplayName   = (New-Label $DisplayName)
        Description   = (New-Label $Description)
        MaxLength     = $MaxLength
        RequiredLevel = @{ Value = $(if ($Required) { "ApplicationRequired" } else { "None" }) }
        FormatName    = @{ Value = "Text" }
    } | Out-Null
    Write-Created "$Table.$Name (string)"
}

function Ensure-MemoColumn {
    param(
        [Parameter(Mandatory = $true)][string]$Table,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [int]$MaxLength = 8000,
        [string]$Description = "",
        [switch]$Required
    )

    if (Test-ColumnExists -Table $Table -Column $Name) { Write-Exists "$Table.$Name"; return }

    Invoke-Dataverse -Method POST -Path "EntityDefinitions(LogicalName='$Table')/Attributes" -InSolution -Body @{
        "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"
        SchemaName    = $Name
        DisplayName   = (New-Label $DisplayName)
        Description   = (New-Label $Description)
        MaxLength     = $MaxLength
        RequiredLevel = @{ Value = $(if ($Required) { "ApplicationRequired" } else { "None" }) }
    } | Out-Null
    Write-Created "$Table.$Name (memo)"
}

function Ensure-IntegerColumn {
    param(
        [Parameter(Mandatory = $true)][string]$Table,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [string]$Description = "",
        [switch]$Required
    )

    if (Test-ColumnExists -Table $Table -Column $Name) { Write-Exists "$Table.$Name"; return }

    Invoke-Dataverse -Method POST -Path "EntityDefinitions(LogicalName='$Table')/Attributes" -InSolution -Body @{
        "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
        SchemaName    = $Name
        DisplayName   = (New-Label $DisplayName)
        Description   = (New-Label $Description)
        MinValue      = -2147483648
        MaxValue      = 2147483647
        RequiredLevel = @{ Value = $(if ($Required) { "ApplicationRequired" } else { "None" }) }
    } | Out-Null
    Write-Created "$Table.$Name (integer)"
}

function Ensure-DecimalColumn {
    param(
        [Parameter(Mandatory = $true)][string]$Table,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [int]$Precision = 4,
        [string]$Description = ""
    )

    if (Test-ColumnExists -Table $Table -Column $Name) { Write-Exists "$Table.$Name"; return }

    Invoke-Dataverse -Method POST -Path "EntityDefinitions(LogicalName='$Table')/Attributes" -InSolution -Body @{
        "@odata.type" = "Microsoft.Dynamics.CRM.DecimalAttributeMetadata"
        SchemaName    = $Name
        DisplayName   = (New-Label $DisplayName)
        Description   = (New-Label $Description)
        Precision     = $Precision
        MinValue      = -100000000000
        MaxValue      = 100000000000
        RequiredLevel = @{ Value = "None" }
    } | Out-Null
    Write-Created "$Table.$Name (decimal)"
}

function Ensure-DateTimeColumn {
    param(
        [Parameter(Mandatory = $true)][string]$Table,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [string]$Description = ""
    )

    if (Test-ColumnExists -Table $Table -Column $Name) { Write-Exists "$Table.$Name"; return }

    Invoke-Dataverse -Method POST -Path "EntityDefinitions(LogicalName='$Table')/Attributes" -InSolution -Body @{
        "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
        SchemaName    = $Name
        DisplayName   = (New-Label $DisplayName)
        Description   = (New-Label $Description)
        Format        = "DateAndTime"
        DateTimeBehavior = @{ Value = "UserLocal" }
        RequiredLevel = @{ Value = "None" }
    } | Out-Null
    Write-Created "$Table.$Name (datetime)"
}

function Ensure-ChoiceColumn {
    param(
        [Parameter(Mandatory = $true)][string]$Table,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string]$GlobalChoiceName,
        [string]$Description = "",
        [switch]$Required
    )

    if (Test-ColumnExists -Table $Table -Column $Name) { Write-Exists "$Table.$Name"; return }

    $choiceId = Get-GlobalChoiceId -Name $GlobalChoiceName

    Invoke-Dataverse -Method POST -Path "EntityDefinitions(LogicalName='$Table')/Attributes" -InSolution -Body @{
        "@odata.type"       = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        SchemaName          = $Name
        DisplayName         = (New-Label $DisplayName)
        Description         = (New-Label $Description)
        RequiredLevel       = @{ Value = $(if ($Required) { "ApplicationRequired" } else { "None" }) }
        "GlobalOptionSet@odata.bind" = "/GlobalOptionSetDefinitions($choiceId)"
    } | Out-Null
    Write-Created "$Table.$Name (choice -> $GlobalChoiceName)"
}

<#
    A lookup is a relationship, not a bare attribute: POST the relationship and let
    Dataverse create the column. Reads come back as _<name>_value.
#>
function Ensure-LookupColumn {
    param(
        [Parameter(Mandatory = $true)][string]$Table,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string]$TargetTable,
        [string]$Description = ""
    )

    if (Test-ColumnExists -Table $Table -Column $Name) { Write-Exists "$Table.$Name"; return }

    $relationshipName = "$($Name)_$($TargetTable)_$($Table)"

    Invoke-Dataverse -Method POST -Path "RelationshipDefinitions" -InSolution -Body @{
        "@odata.type"          = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
        SchemaName             = $relationshipName
        ReferencedEntity       = $TargetTable
        ReferencingEntity      = $Table
        CascadeConfiguration   = @{
            Assign   = "NoCascade"
            Delete   = "RemoveLink"
            Merge    = "NoCascade"
            Reparent = "NoCascade"
            Share    = "NoCascade"
            Unshare  = "NoCascade"
        }
        Lookup = @{
            "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
            SchemaName    = $Name
            DisplayName   = (New-Label $DisplayName)
            Description   = (New-Label $Description)
            RequiredLevel = @{ Value = "None" }
        }
    } | Out-Null
    Write-Created "$Table.$Name (lookup -> $TargetTable)"
}

<#
    Alternate keys are what make uniqueness a platform guarantee rather than a
    read-then-write race in the client. Creation is ASYNCHRONOUS: Dataverse queues a
    system job to build the supporting index, and the key does not enforce anything
    until EntityKeyIndexStatus reaches Active.
#>
function Ensure-AlternateKey {
    param(
        [Parameter(Mandatory = $true)][string]$Table,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string[]]$Columns,
        [int]$TimeoutSeconds = 180
    )

    $existing = (Invoke-Dataverse -Method GET `
            -Path "EntityDefinitions(LogicalName='$Table')/Keys?`$select=SchemaName,EntityKeyIndexStatus").value

    $match = $existing | Where-Object { $_.SchemaName -eq $Name }
    if ($match) {
        Write-Exists "alternate key $Table.$Name (status: $($match.EntityKeyIndexStatus))"
        return
    }

    Invoke-Dataverse -Method POST -Path "EntityDefinitions(LogicalName='$Table')/Keys" -InSolution -Body @{
        "@odata.type" = "Microsoft.Dynamics.CRM.EntityKeyMetadata"
        SchemaName    = $Name
        DisplayName   = (New-Label $DisplayName)
        KeyAttributes = $Columns
    } | Out-Null

    Write-Host "  Waiting for alternate key $Table.$Name to index..." -ForegroundColor DarkGray
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Seconds 5
        $keys = (Invoke-Dataverse -Method GET `
                -Path "EntityDefinitions(LogicalName='$Table')/Keys?`$select=SchemaName,EntityKeyIndexStatus").value
        $status = ($keys | Where-Object { $_.SchemaName -eq $Name }).EntityKeyIndexStatus

        if ($status -in @("Failed", "IndexFailed")) {
            throw "Alternate key $Table.$Name failed to index (status: $status). Duplicate rows already present will block index creation."
        }
        if ((Get-Date) -gt $deadline) {
            throw "Alternate key $Table.$Name did not reach Active within $TimeoutSeconds seconds (status: $status). It will not enforce uniqueness until it does."
        }
    } while ($status -ne "Active")

    Write-Created "alternate key $Table.$Name over $($Columns -join ', ')"
}

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------

<#
    A code app ships as one static bundle promoted across environments, so anything
    environment-specific must be read at runtime rather than baked in at build time.
    Definitions travel in the solution; values are usually set per environment, which
    is why the value row is only written when the caller supplies one.
#>
function Ensure-EnvironmentVariable {
    param(
        [Parameter(Mandatory = $true)][string]$SchemaName,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [string]$Description = "",
        [string]$DefaultValue,
        [string]$Value
    )

    $existing = (Invoke-Dataverse -Method GET `
            -Path "environmentvariabledefinitions?`$filter=schemaname eq '$SchemaName'&`$select=environmentvariabledefinitionid").value

    if ($existing -and $existing.Count -gt 0) {
        $definitionId = $existing[0].environmentvariabledefinitionid
        Write-Exists "environment variable definition '$SchemaName'"
    }
    else {
        $body = @{
            schemaname  = $SchemaName
            displayname = $DisplayName
            description = $Description
            type        = 100000000   # String
        }
        if ($PSBoundParameters.ContainsKey("DefaultValue")) { $body.defaultvalue = $DefaultValue }

        $created = Invoke-Dataverse -Method POST `
            -Path "environmentvariabledefinitions?`$select=environmentvariabledefinitionid" `
            -InSolution -ReturnRecord -Body $body
        $definitionId = $created.environmentvariabledefinitionid
        Write-Created "environment variable definition '$SchemaName'"
    }

    if ([string]::IsNullOrWhiteSpace($Value)) { return }

    $existingValue = (Invoke-Dataverse -Method GET `
            -Path "environmentvariablevalues?`$filter=_environmentvariabledefinitionid_value eq $definitionId&`$select=environmentvariablevalueid,value").value

    if ($existingValue -and $existingValue.Count -gt 0) {
        if ($existingValue[0].value -eq $Value) {
            Write-Exists "environment variable value for '$SchemaName'"
            return
        }
        Invoke-Dataverse -Method PATCH `
            -Path "environmentvariablevalues($($existingValue[0].environmentvariablevalueid))" `
            -Body @{ value = $Value } | Out-Null
        Write-Created "updated environment variable value for '$SchemaName'"
        return
    }

    Invoke-Dataverse -Method POST -Path "environmentvariablevalues" -Body @{
        value = $Value
        "EnvironmentVariableDefinitionId@odata.bind" = "/environmentvariabledefinitions($definitionId)"
    } | Out-Null
    Write-Created "environment variable value for '$SchemaName'"
}

# ---------------------------------------------------------------------------
# Publisher and solution
# ---------------------------------------------------------------------------

Write-Step "Ensuring publisher and solution..."
$publisherId = Ensure-Publisher -UniqueName $Prefix -FriendlyName $PublisherName -CustomizationPrefix $Prefix
Ensure-Solution -UniqueName $SolutionName -FriendlyName $SolutionDisplayName -PublisherId $publisherId | Out-Null

# ---------------------------------------------------------------------------
# Global choices
# ---------------------------------------------------------------------------

Write-Step "Ensuring global choices..."

$choiceHubItemType = "$($Prefix)_hubitemtype"
$choiceAdoptionStatus = "$($Prefix)_adoptionstatus"
$choiceParticipationStatus = "$($Prefix)_participationstatus"
$choiceLinkRelationship = "$($Prefix)_linkrelationship"
$choiceApprovalState = "$($Prefix)_approvalstate"
$choiceActorType = "$($Prefix)_actortype"

Ensure-GlobalChoice -Name $choiceHubItemType -DisplayName "Hub Item Type" -Options @("Idea", "Solution")
Ensure-GlobalChoice -Name $choiceAdoptionStatus -DisplayName "Adoption Status" -Options @("Exploring", "Implementing", "Using")
Ensure-GlobalChoice -Name $choiceParticipationStatus -DisplayName "Participation Status" -Options @("Proposed", "Accepted", "Rejected", "Withdrawn")
Ensure-GlobalChoice -Name $choiceLinkRelationship -DisplayName "Link Relationship" -Options @("Proposed", "Relevant", "Existing")
Ensure-GlobalChoice -Name $choiceApprovalState -DisplayName "Approval State" -Options @("Pending", "Approved", "Rejected")
Ensure-GlobalChoice -Name $choiceActorType -DisplayName "Actor Type" -Options @("User", "Agent", "System")

# ---------------------------------------------------------------------------
# Vote
# ---------------------------------------------------------------------------

Write-Step "Ensuring the vote table..."
$vote = "$($Prefix)_vote"

Ensure-Table -LogicalName $vote -DisplayName "Vote" -DisplayCollectionName "Votes" `
    -Description "One upvote by one person on one idea or solution." -PrimaryColumnDisplayName "Vote Key"

Ensure-StringColumn  -Table $vote -Name "$($Prefix)_targetkey"  -DisplayName "Target Key" -MaxLength 100 -Required `
    -Description "idea:{workItemId} or solution:{workItemId}."
Ensure-ChoiceColumn  -Table $vote -Name "$($Prefix)_targettype" -DisplayName "Target Type" -GlobalChoiceName $choiceHubItemType -Required
Ensure-IntegerColumn -Table $vote -Name "$($Prefix)_targetid"   -DisplayName "Target Id" -Required `
    -Description "Azure DevOps work item id of the idea or solution."
Ensure-LookupColumn  -Table $vote -Name "$($Prefix)_voterid"    -DisplayName "Voter" -TargetTable "systemuser" `
    -Description "Who cast the vote. Half of the uniqueness key."

# One vote per person per target, enforced by the platform. This replaces the
# read-then-write check the SharePoint provider has to do, which can double-vote
# under concurrency.
Ensure-AlternateKey -Table $vote -Name "$($Prefix)_vote_unique" -DisplayName "Unique vote per target and voter" `
    -Columns @("$($Prefix)_targetkey", "$($Prefix)_voterid")

# ---------------------------------------------------------------------------
# Adoption
# ---------------------------------------------------------------------------

Write-Step "Ensuring the adoption table..."
$adoption = "$($Prefix)_adoption"

Ensure-Table -LogicalName $adoption -DisplayName "Adoption" -DisplayCollectionName "Adoptions" `
    -Description "A team or project putting a solution to use." -PrimaryColumnDisplayName "Adoption"

Ensure-IntegerColumn  -Table $adoption -Name "$($Prefix)_solutionid"      -DisplayName "Solution Id" -Required `
    -Description "Azure DevOps work item id of the solution being adopted."
Ensure-StringColumn   -Table $adoption -Name "$($Prefix)_projectname"     -DisplayName "Project Name" -MaxLength 200 -Required
Ensure-StringColumn   -Table $adoption -Name "$($Prefix)_team"            -DisplayName "Team" -MaxLength 200
Ensure-ChoiceColumn   -Table $adoption -Name "$($Prefix)_adoptionstatus"  -DisplayName "Status" -GlobalChoiceName $choiceAdoptionStatus -Required
Ensure-LookupColumn   -Table $adoption -Name "$($Prefix)_startedbyid"     -DisplayName "Started By" -TargetTable "systemuser"
Ensure-DateTimeColumn -Table $adoption -Name "$($Prefix)_startedon"       -DisplayName "Started On"
Ensure-DateTimeColumn -Table $adoption -Name "$($Prefix)_completedon"     -DisplayName "Completed On" `
    -Description "Set when the adoption reaches Using. Null means still active."

# ---------------------------------------------------------------------------
# Comments: deliberately NOT a table here
# ---------------------------------------------------------------------------

# Comments were a Dataverse table so they could carry a three-tier audience
# (Authenticated / SubmitterAndApprovers / ApproversOnly). That audience is gone,
# and with it the reason for the table.
#
# An Azure DevOps work item comment is readable by anyone who can read the item, so
# a "private" tier could not be represented honestly — and a side table pretending
# otherwise is worse than not offering one. Who sees a conversation is now decided
# by who sees the ITEM, through its area path: one mechanism instead of two that
# could disagree.
#
# Using ADO's own comments also brings @mentions, reactions, edit history, the work
# item UI and ADO notifications, with nothing to replicate.
#
# Consequence to be aware of: anything an automated triage step writes is visible
# to the submitter. Findings that should not be belong in a field, not a comment.
# ---------------------------------------------------------------------------
# Participation
# ---------------------------------------------------------------------------

Write-Step "Ensuring the participation table..."
$participation = "$($Prefix)_participation"

Ensure-Table -LogicalName $participation -DisplayName "Participation Request" -DisplayCollectionName "Participation Requests" `
    -Description "Someone asking to help with an idea or solution." -PrimaryColumnDisplayName "Participation"

Ensure-StringColumn   -Table $participation -Name "$($Prefix)_targetkey"           -DisplayName "Target Key" -MaxLength 100 -Required
Ensure-ChoiceColumn   -Table $participation -Name "$($Prefix)_targettype"          -DisplayName "Target Type" -GlobalChoiceName $choiceHubItemType -Required
Ensure-IntegerColumn  -Table $participation -Name "$($Prefix)_targetid"            -DisplayName "Target Id" -Required
Ensure-MemoColumn     -Table $participation -Name "$($Prefix)_message"             -DisplayName "Message" -MaxLength 4000
Ensure-ChoiceColumn   -Table $participation -Name "$($Prefix)_participationstatus" -DisplayName "Status" -GlobalChoiceName $choiceParticipationStatus -Required
Ensure-LookupColumn   -Table $participation -Name "$($Prefix)_requestedbyid"       -DisplayName "Requested By" -TargetTable "systemuser"
Ensure-LookupColumn   -Table $participation -Name "$($Prefix)_decidedbyid"         -DisplayName "Decided By" -TargetTable "systemuser"
Ensure-MemoColumn     -Table $participation -Name "$($Prefix)_rationale"           -DisplayName "Rationale" -MaxLength 4000
Ensure-DateTimeColumn -Table $participation -Name "$($Prefix)_decidedon"           -DisplayName "Decided On"

# ---------------------------------------------------------------------------
# Idea <-> Solution links: deliberately NOT a table here
# ---------------------------------------------------------------------------

# An earlier design kept links in Dataverse so a link could carry a relationship
# taxonomy (Proposed / Relevant / Existing) and its own approval state, neither of
# which fits on an Azure DevOps link.
#
# Both of those only existed because anyone could propose a link. Restricting
# linking to reviewers removes the pending state, and with it the taxonomy: a link
# just means "this solution answers this idea". That is a plain ADO `Related` link,
# which brings the work item link panel, traceability and WIQL queries for free.
#
# The cycai_linkrelationship and cycai_approvalstate global choices are left in
# place; approval state is still used elsewhere and choices are cheap.

# ---------------------------------------------------------------------------
# Activity
# ---------------------------------------------------------------------------

Write-Step "Ensuring the activity table..."
$activity = "$($Prefix)_activity"

# The user-facing selected history, distinct from Dataverse's own audit log. Not
# every domain event qualifies; the projector decides.
Ensure-Table -LogicalName $activity -DisplayName "Activity" -DisplayCollectionName "Activity" `
    -Description "User-facing activity feed entry, projected from domain events." -PrimaryColumnDisplayName "Activity"

Ensure-StringColumn   -Table $activity -Name "$($Prefix)_action"      -DisplayName "Action" -MaxLength 100 -Required `
    -Description "Stable action key, e.g. vote.added. UI wording derives from this, never from stored prose."
Ensure-StringColumn   -Table $activity -Name "$($Prefix)_subjectkey"  -DisplayName "Subject Key" -MaxLength 100
Ensure-ChoiceColumn   -Table $activity -Name "$($Prefix)_subjecttype" -DisplayName "Subject Type" -GlobalChoiceName $choiceHubItemType
Ensure-IntegerColumn  -Table $activity -Name "$($Prefix)_subjectid"   -DisplayName "Subject Id"
Ensure-MemoColumn     -Table $activity -Name "$($Prefix)_summary"     -DisplayName "Summary" -MaxLength 4000
Ensure-LookupColumn   -Table $activity -Name "$($Prefix)_actorid"     -DisplayName "Actor" -TargetTable "systemuser"
Ensure-ChoiceColumn   -Table $activity -Name "$($Prefix)_actortype"   -DisplayName "Actor Type" -GlobalChoiceName $choiceActorType
Ensure-DateTimeColumn -Table $activity -Name "$($Prefix)_occurredon"  -DisplayName "Occurred On"

# ---------------------------------------------------------------------------
# Momentum projection
# ---------------------------------------------------------------------------

Write-Step "Ensuring the momentum projection table..."
$momentum = "$($Prefix)_momentum"

# Required, not an optimisation. The ADO connector has no batch form for work item
# comments (a 30-row list would spend 30 of the 300-calls/60s budget), and FetchXML
# aggregates cannot order by an aggregate, so demand rank cannot be a live query.
Ensure-Table -LogicalName $momentum -DisplayName "Momentum" -DisplayCollectionName "Momentum" `
    -Description "Precomputed engagement rollup, one row per hub item. Derived; never the source of truth." `
    -PrimaryColumnDisplayName "Momentum Key"

Ensure-StringColumn   -Table $momentum -Name "$($Prefix)_targetkey"          -DisplayName "Target Key" -MaxLength 100 -Required
Ensure-ChoiceColumn   -Table $momentum -Name "$($Prefix)_targettype"         -DisplayName "Target Type" -GlobalChoiceName $choiceHubItemType -Required
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_targetid"           -DisplayName "Target Id" -Required
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_votecount"          -DisplayName "Vote Count"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_votes7d"            -DisplayName "Votes (7d)"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_votes30d"           -DisplayName "Votes (30d)"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_adoptioncount"      -DisplayName "Adoption Count"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_adoptions30d"       -DisplayName "Adoptions (30d)"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_teamcount"          -DisplayName "Team Count"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_activeusecount"     -DisplayName "Active Use Count"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_completedusecount"  -DisplayName "Completed Use Count"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_commentcount"       -DisplayName "Comment Count"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_contributorcount"   -DisplayName "Contributor Count"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_linkedcount"        -DisplayName "Linked Item Count"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_demandrank"         -DisplayName "Demand Rank"
Ensure-IntegerColumn  -Table $momentum -Name "$($Prefix)_previousdemandrank" -DisplayName "Previous Demand Rank" `
    -Description "Lets the UI show relative movement (#7 -> #5) rather than an absolute score."
Ensure-DecimalColumn  -Table $momentum -Name "$($Prefix)_momentumscore"      -DisplayName "Momentum Score"
Ensure-DateTimeColumn -Table $momentum -Name "$($Prefix)_calculatedon"       -DisplayName "Calculated On"

Ensure-AlternateKey -Table $momentum -Name "$($Prefix)_momentum_unique" -DisplayName "One rollup per target" `
    -Columns @("$($Prefix)_targetkey")

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------

Write-Step "Ensuring environment variables..."

Ensure-EnvironmentVariable `
    -SchemaName "$($Prefix)_InnovationBacklogAdoOrgId" `
    -DisplayName "InnovationBacklog_ADO_OrgId" `
    -Description "Azure DevOps organization that holds the Idea, Solution and Backlog Item work items." `
    -Value $AdoOrgId

Ensure-EnvironmentVariable `
    -SchemaName "$($Prefix)_InnovationBacklogAdoProjectId" `
    -DisplayName "InnovationBacklog_ADO_ProjectId" `
    -Description "Azure DevOps project id within the organization." `
    -Value $AdoProjectId

Ensure-EnvironmentVariable `
    -SchemaName "$($Prefix)_InnovationBacklogEnvDesignation" `
    -DisplayName "InnovationBacklog_EnvironmentDesignation" `
    -Description "Non-production banner label. Leave blank in production so the banner disappears." `
    -DefaultValue ""

# ---------------------------------------------------------------------------
# Choice values for the bridge registry
# ---------------------------------------------------------------------------

# Dataverse assigns option values inside the publisher's option value prefix range,
# so they are stable per publisher but not knowable in advance. Print them so the
# choice registry in the provider can be written from real values.
Write-Step "Choice values (for the provider's choice registry)..."

foreach ($choiceName in @($choiceHubItemType, $choiceAdoptionStatus,
        $choiceParticipationStatus, $choiceLinkRelationship, $choiceApprovalState, $choiceActorType)) {

    # No $select: Options is a complex collection and is omitted unless the whole
    # definition is returned.
    $definition = Invoke-Dataverse -Method GET -Path "GlobalOptionSetDefinitions(Name='$choiceName')"
    Write-Host "  $choiceName" -ForegroundColor White
    foreach ($option in $definition.Options) {
        $label = $option.Label.LocalizedLabels[0].Label
        Write-Host ("    {0,-24} {1}" -f $label, $option.Value) -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Dataverse provisioning complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  1. Register the tables in the code app:"
Write-Host "       pac code add-data-source -a dataverse -t $vote"
Write-Host "       (repeat for adoption, comment, participation, activity, momentum)"
Write-Host "  2. Register the tables the runtime needs alongside them:"
Write-Host "       systemuser, annotation, environmentvariabledefinition, environmentvariablevalue"
Write-Host "  3. Copy the choice values above into the provider's choice registry."
Write-Host ""

[PSCustomObject]@{
    EnvironmentUrl = $EnvironmentUrl
    Prefix         = $Prefix
    SolutionName   = $SolutionName
    Tables         = @($vote, $adoption, $participation, $activity, $momentum)
}
