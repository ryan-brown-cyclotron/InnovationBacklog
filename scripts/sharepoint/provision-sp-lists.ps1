#requires -Modules PnP.PowerShell
<#
.SYNOPSIS
    Provisions the SharePoint Online lists required by the Momentum SPFx web part.
.DESCRIPTION
    Connects to a target SharePoint site via PnP PowerShell and creates the seven
    custom lists used by the Momentum data layer: Requests, Solutions, Votes,
    Comments, SolutionUses, RequestSolutions, and Activity.
.PARAMETER SiteUrl
    The URL of the SharePoint Online site where the lists will be created.
.EXAMPLE
    .\provision-sp-lists.ps1 -SiteUrl https://contoso.sharepoint.com/sites/momentum
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [string]$PnpClientId = "ad0b001e-284b-4a14-aa06-25c2dab8e81f"
)

$ErrorActionPreference = "Stop"

Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $PnpClientId

function Ensure-List {
    param(
        [string]$Title,
        [string]$Description = ""
    )

    $list = Get-PnPList -Identity $Title -ErrorAction SilentlyContinue
    if (-not $list) {
        New-PnPList -Title $Title -Template GenericList -Url $Title.Replace(" ", "") | Out-Null
        if ($Description) { Set-PnPList -Identity $Title -Description $Description | Out-Null }
        Write-Host "Created list: $Title" -ForegroundColor Green
    } else {
        Write-Host "List already exists: $Title" -ForegroundColor Yellow
    }
    return $Title
}

function Ensure-TextField {
    param(
        [string]$ListTitle,
        [string]$Name,
        [string]$Type = "Text",
        [switch]$Required,
        [string]$DefaultValue = ""
    )

    $field = Get-PnPField -List $ListTitle -Identity $Name -ErrorAction SilentlyContinue
    if (-not $field) {
        $params = @{
            List    = $ListTitle
            DisplayName = $Name
            InternalName = $Name
            Type    = $Type
        }
        if ($Required.IsPresent) { $params.Add("Required", $true) }
        Add-PnPField @params | Out-Null
        if ($DefaultValue) {
            $created = Get-PnPField -List $ListTitle -Identity $Name
            $created.DefaultValue = $DefaultValue
            $created.Update()
            Invoke-PnPQuery
        }
        Write-Host "  Added field $Name to $ListTitle" -ForegroundColor Green
    } else {
        Write-Host "  Field $Name already exists in $ListTitle" -ForegroundColor Gray
    }
}

function Ensure-NumberField {
    param(
        [string]$ListTitle,
        [string]$Name,
        [switch]$Required
    )

    $field = Get-PnPField -List $ListTitle -Identity $Name -ErrorAction SilentlyContinue
    if (-not $field) {
        $params = @{
            List = $ListTitle
            DisplayName = $Name
            InternalName = $Name
            Type = "Number"
        }
        if ($Required.IsPresent) { $params.Add("Required", $true) }
        Add-PnPField @params | Out-Null
        Write-Host "  Added field $Name to $ListTitle" -ForegroundColor Green
    } else {
        Write-Host "  Field $Name already exists in $ListTitle" -ForegroundColor Gray
    }
}

function Ensure-ChoiceField {
    param(
        [string]$ListTitle,
        [string]$Name,
        [string[]]$Choices,
        [switch]$Required
    )

    $field = Get-PnPField -List $ListTitle -Identity $Name -ErrorAction SilentlyContinue
    if (-not $field) {
        $params = @{
            List = $ListTitle
            DisplayName = $Name
            InternalName = $Name
            Type = "Choice"
            Choices = $Choices
        }
        if ($Required.IsPresent) { $params.Add("Required", $true) }
        Add-PnPField @params | Out-Null
        Write-Host "  Added field $Name to $ListTitle" -ForegroundColor Green
    } else {
        Write-Host "  Field $Name already exists in $ListTitle" -ForegroundColor Gray
    }
}

function Ensure-DateTimeField {
    param(
        [string]$ListTitle,
        [string]$Name,
        [switch]$Required,
        [string]$DefaultValue = ""
    )

    $field = Get-PnPField -List $ListTitle -Identity $Name -ErrorAction SilentlyContinue
    if (-not $field) {
        $params = @{
            List = $ListTitle
            DisplayName = $Name
            InternalName = $Name
            Type = "DateTime"
        }
        if ($Required.IsPresent) { $params.Add("Required", $true) }
        Add-PnPField @params | Out-Null
        if ($DefaultValue) {
            $created = Get-PnPField -List $ListTitle -Identity $Name
            $created.DefaultValue = $DefaultValue
            $created.Update()
            Invoke-PnPQuery
        }
        Write-Host "  Added field $Name to $ListTitle" -ForegroundColor Green
    } else {
        Write-Host "  Field $Name already exists in $ListTitle" -ForegroundColor Gray
    }
}

# Requests list
$list = Ensure-List -Title "Requests" -Description "Momentum backlog requests and ideas"
Ensure-TextField -ListTitle $list -Name "Description" -Type "Note"
Ensure-TextField -ListTitle $list -Name "Status" -Type "Text" -DefaultValue "Created"
Ensure-TextField -ListTitle $list -Name "SubmittedBy" -Type "Text"
Ensure-TextField -ListTitle $list -Name "RequestType" -Type "Text" -DefaultValue "Backlog"
Ensure-TextField -ListTitle $list -Name "CanonicalSolutionId" -Type "Text"

# Solutions list
$list = Ensure-List -Title "Solutions" -Description "Momentum reusable solution catalog"
Ensure-TextField -ListTitle $list -Name "Description" -Type "Note"
Ensure-TextField -ListTitle $list -Name "SolutionType" -Type "Text" -DefaultValue "Library"
Ensure-TextField -ListTitle $list -Name "Status" -Type "Text" -DefaultValue "Published"
Ensure-TextField -ListTitle $list -Name "RepositoryUrl" -Type "Text"
Ensure-TextField -ListTitle $list -Name "RepositoryOwner" -Type "Text"
Ensure-TextField -ListTitle $list -Name "RepositoryName" -Type "Text"
Ensure-TextField -ListTitle $list -Name "SubmittedBy" -Type "Text"
Ensure-TextField -ListTitle $list -Name "OwnerId" -Type "Text"
Ensure-NumberField -ListTitle $list -Name "UseCount"

# Votes list
$list = Ensure-List -Title "Votes" -Description "User votes on Requests and Solutions"
Ensure-TextField -ListTitle $list -Name "TargetId" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "TargetType" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "UserId" -Type "Text" -Required

# Comments list
$list = Ensure-List -Title "Comments" -Description "Comments on Requests and Solutions"
Ensure-TextField -ListTitle $list -Name "Body" -Type "Note" -Required
Ensure-TextField -ListTitle $list -Name "SubjectId" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "SubjectType" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "AuthorId" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "Audience" -Type "Text" -DefaultValue "Authenticated"

# SolutionUses list
$list = Ensure-List -Title "SolutionUses" -Description "Adoption and implementation tracking for Solutions"
Ensure-TextField -ListTitle $list -Name "SolutionId" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "StartedBy" -Type "Text"
Ensure-TextField -ListTitle $list -Name "ProjectName" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "Team" -Type "Text"
Ensure-TextField -ListTitle $list -Name "Status" -Type "Text" -DefaultValue "Exploring"
Ensure-TextField -ListTitle $list -Name "CompletedAt" -Type "Text"

# RequestSolutions list
$list = Ensure-List -Title "RequestSolutions" -Description "Relationships between Requests and Solutions"
Ensure-TextField -ListTitle $list -Name "RequestId" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "SolutionId" -Type "Text" -Required
Ensure-TextField -ListTitle $list -Name "Relationship" -Type "Text" -DefaultValue "Proposed"
Ensure-TextField -ListTitle $list -Name "AddedBy" -Type "Text"

# Activity list
$list = Ensure-List -Title "Activity" -Description "Activity stream for the Innovation Hub"
Ensure-TextField -ListTitle $list -Name "SubjectId" -Type "Text" -Required
Ensure-ChoiceField -ListTitle $list -Name "SubjectType" -Choices @("Request", "Solution") -Required
Ensure-TextField -ListTitle $list -Name "Action" -Type "Text"
Ensure-TextField -ListTitle $list -Name "ActorId" -Type "Text"
Ensure-TextField -ListTitle $list -Name "Summary" -Type "Note"
Ensure-DateTimeField -ListTitle $list -Name "OccurredAt" -DefaultValue "[today]"

Write-Host "Provisioning complete." -ForegroundColor Green
