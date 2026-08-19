#Requires -Version 7.0
<#
.SYNOPSIS
    Provisions the Azure DevOps git repository that skill intake commits into.

.DESCRIPTION
    Creates the repository and seeds the two things intake needs on day one: a
    marketplace manifest, and a plugins folder for it to point at. Without the manifest
    the first adoption fails with "the skills repository is not initialised" - the
    intake service reads it before every commit and will not invent one.

    Idempotent: every Ensure-* helper reads before it writes and reports Exists instead
    of failing, so re-running after a partial failure is the intended recovery path.

    LAYOUT. Intake writes to plugins/{segment}/skills/{solutionId}__{name}/, where
    segment is chosen by the reviewer, solutionId is the catalogue entry the skill was
    adopted from, and name is the skill's published name. The solution id IS the link
    back - there is no sidecar file and no second store.

    The double underscore is the separator because a single one is legal inside a skill
    name and splitting the folder back apart has to be unambiguous.

    Neither part has to agree with anything else: skills are discovered by the name in
    their SKILL.md frontmatter, not by their directory, so the folder is free to carry
    the id alongside it.

.PARAMETER Organization
    Azure DevOps organization name.

.PARAMETER Project
    Project that will hold the repository.

.PARAMETER RepositoryName
    Name of the repository to create.

.PARAMETER Segments
    Initial plugin segments to scaffold. Each becomes a marketplace entry and a folder.
    Segments are also created on demand by intake, so this is a convenience.

.PARAMETER Pat
    Personal access token with Code (Read, write, & manage). Defaults to $env:AZDO_PAT.

.EXAMPLE
    ./Provision-SkillsRepository.ps1 -Organization CyclotronInc -Project "Innovation Backlog"

.EXAMPLE
    ./Provision-SkillsRepository.ps1 -Organization CyclotronInc -Project "Innovation Backlog" `
        -Segments engineering,operations
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Organization,

    [Parameter(Mandatory = $true)]
    [string]$Project,

    [string]$RepositoryName = "skills",

    [string[]]$Segments = @(),

    [string]$Branch = "main",

    [string]$Pat = $env:AZDO_PAT
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Pat)) {
    throw "No personal access token. Pass -Pat or set `$env:AZDO_PAT."
}

$script:ApiVersion = "7.1"
$script:BaseUrl = "https://dev.azure.com/$Organization/$([uri]::EscapeDataString($Project))/_apis"
$script:AuthHeader = @{
    Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$Pat"))
}

function Write-Created { param([string]$Message) Write-Host "  Created $Message" -ForegroundColor Green }
function Write-Exists { param([string]$Message) Write-Host "  Exists  $Message" -ForegroundColor DarkGray }
function Write-Step { param([string]$Message) Write-Host "`n$Message" -ForegroundColor Cyan }

<#
    Azure DevOps delays rather than rejects when a caller approaches its throughput
    budget, and sends Retry-After when it does.
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
        $params.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
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

function Ensure-Repository {
    param([Parameter(Mandatory = $true)][string]$Name)

    $existing = (Invoke-Ado GET "git/repositories").value | Where-Object { $_.name -eq $Name }

    if ($existing) {
        Write-Exists "repository '$Name'"
        return $existing
    }

    $created = Invoke-Ado POST "git/repositories" @{ name = $Name }
    Write-Created "repository '$Name'"
    return $created
}

function Get-BranchTip {
    param([Parameter(Mandatory = $true)]$Repository)

    $refs = Invoke-Ado GET "git/repositories/$($Repository.id)/refs?filter=heads/$Branch"
    if ($refs.value -and $refs.value.Count -gt 0) { return $refs.value[0].objectId }

    # An empty repository has no refs at all. Azure DevOps takes all-zeroes as
    # "create this branch" on the first push.
    return "0000000000000000000000000000000000000000"
}

function Test-FileExists {
    param([Parameter(Mandatory = $true)]$Repository, [Parameter(Mandatory = $true)][string]$Path)

    $encoded = [uri]::EscapeDataString("/$($Path.TrimStart('/'))")
    $item = Invoke-Ado GET `
        "git/repositories/$($Repository.id)/items?path=$encoded&versionDescriptor.version=$Branch" `
        -AllowNotFound
    return $null -ne $item
}

function Push-Files {
    param(
        [Parameter(Mandatory = $true)]$Repository,
        [Parameter(Mandatory = $true)][hashtable]$Files,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $changes = @()
    foreach ($path in $Files.Keys) {
        $exists = Test-FileExists -Repository $Repository -Path $path
        if ($exists) {
            Write-Exists $path
            continue
        }

        $changes += @{
            changeType = "add"
            item       = @{ path = "/$($path.TrimStart('/'))" }
            newContent = @{ content = $Files[$path]; contentType = "rawtext" }
        }
    }

    if ($changes.Count -eq 0) { return $null }

    $push = Invoke-Ado POST "git/repositories/$($Repository.id)/pushes" @{
        refUpdates = @(@{ name = "refs/heads/$Branch"; oldObjectId = (Get-BranchTip -Repository $Repository) })
        commits    = @(@{ comment = $Message; changes = $changes })
    }

    foreach ($change in $changes) { Write-Created $change.item.path }
    return $push.commits[0].commitId
}

# ---------------------------------------------------------------------------
# Seed content
# ---------------------------------------------------------------------------

function New-Manifest {
    param([string[]]$SegmentNames)

    $plugins = @()
    foreach ($segment in $SegmentNames) {
        $plugins += [ordered]@{
            name    = $segment
            source  = "./plugins/$segment"
            version = "1.0.0"
        }
    }

    # Written the way the intake service writes it, so the first adoption does not
    # produce a whole-file reformat diff.
    return ([ordered]@{
        name        = "momentum"
        owner       = [ordered]@{ name = $Organization }
        description = "Skills adopted from the Innovation Backlog."
        plugins     = $plugins
    } | ConvertTo-Json -Depth 12)
}

$readme = @"
# Skills

Skills adopted from the Innovation Backlog. Written by the ``CommitApprovedSkill``
endpoint, not by hand.

## Layout

``````
plugins/{segment}/skills/{solutionId}/SKILL.md
``````

``segment`` is the plugin a reviewer filed the skill under. ``solutionId`` is the GUID of
the catalogue entry it was adopted from, and it is the **entire** link between this
repository and the backlog: no sidecar file, no lookup table. A folder name answers
"which solution is this?" and a path answers "where is this solution's skill?".

The human-readable name is not in the path. It lives in the ``name`` field of the
skill's own SKILL.md frontmatter, and in the commit message that added it. To find a
skill by name, grep the frontmatter:

``````bash
grep -r "^name: pdf-tables" plugins/*/skills/*/SKILL.md
``````

## Editing by hand

Prefer not to. Intake validates a package before writing it - frontmatter present,
name usable as a folder, description non-empty, no paths colliding by case - and a
hand-edited skill gets none of that until someone re-uploads it.
"@

$gitattributes = @"
* text=auto eol=lf
*.png binary
*.jpg binary
*.gif binary
*.ico binary
*.pdf binary
"@

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

Write-Host "Organization : $Organization"
Write-Host "Project      : $Project"
Write-Host "Repository   : $RepositoryName"
Write-Host "Branch       : $Branch"

Write-Step "Repository"
$repository = Ensure-Repository -Name $RepositoryName

Write-Step "Seed files"
$files = @{
    ".claude-plugin/marketplace.json" = (New-Manifest -SegmentNames $Segments)
    "README.md"                       = $readme
    ".gitattributes"                  = $gitattributes
}

foreach ($segment in $Segments) {
    # Git stores no empty folders; a placeholder makes the segment visible before its
    # first skill lands.
    $files["plugins/$segment/.gitkeep"] = ""
}

$commitId = Push-Files -Repository $repository -Files $files -Message "Initialise skills repository"

if ($commitId) {
    Write-Host "`n  Commit $commitId" -ForegroundColor Green
}
else {
    Write-Host "`n  Nothing to do; the repository is already initialised." -ForegroundColor DarkGray
}

Write-Host "`n--- Function app settings ---" -ForegroundColor Cyan
Write-Host "Momentum:Skills:Host                     = AzureDevOps"
Write-Host "Momentum:Skills:AzureDevOps:Organization = $Organization"
Write-Host "Momentum:Skills:AzureDevOps:Project      = $Project"
Write-Host "Momentum:Skills:AzureDevOps:Repository   = $RepositoryName"
Write-Host "Momentum:Skills:Branch                   = $Branch"
Write-Host "(Organization and Project fall back to Momentum:Mcp:AdoOrganization / AdoProject.)"
Write-Host "As Azure app settings, replace each colon with a double underscore."

Write-Host "`n--- Notes ---" -ForegroundColor Yellow
Write-Host "This script is superseded by POST skills/provision, which does the same thing with"
Write-Host "the credential the function app already has, on Azure DevOps or GitHub. See"
Write-Host "docs/reference/skill-intake-configuration.md."
Write-Host ""
Write-Host "Who intake commits as is a setting, not a property of this repository:"
Write-Host "  Momentum:Skills:Auth = Caller  -> commits as the approver; each needs Contribute here."
Write-Host "  Momentum:Skills:Auth = Pat     -> commits as the token owner; set Momentum:Skills:Pat."
Write-Host "The PAT used by this script provisions the repository and is not implicitly reused."

[PSCustomObject]@{
    RepositoryId  = $repository.id
    RepositoryUrl = $repository.webUrl
    Branch        = $Branch
    CommitId      = $commitId
}
