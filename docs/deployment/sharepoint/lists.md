# Provision SharePoint Lists

The Momentum web part stores all data in seven SharePoint lists on the target site. The `provision-sp-lists.ps1` script creates them idempotently — safe to re-run.

## Run the script

```powershell
pwsh scripts/sharepoint/provision-sp-lists.ps1 -SiteUrl 'https://<tenant>.sharepoint.com/sites/Innovation' -PnpClientId '<client-id>'
```

This opens an interactive browser login, then creates all seven lists with their columns and default values.

## Lists and columns

### Requests

| Column | Type | Required | Default |
|---|---|---|---|
| Description | Note | | |
| Status | Text | | Created |
| SubmittedBy | Text | | |
| Type | Text | | Backlog |
| CanonicalSolutionId | Text | | |

### Solutions

| Column | Type | Required | Default |
|---|---|---|---|
| Description | Note | | |
| Type | Text | | Library |
| Status | Text | | Published |
| RepositoryUrl | Text | | |
| RepositoryOwner | Text | | |
| RepositoryName | Text | | |
| SubmittedBy | Text | | |
| OwnerId | Text | | |
| UseCount | Number | | |

### Votes

| Column | Type | Required |
|---|---|---|
| TargetId | Text | Yes |
| TargetType | Text | Yes |
| UserId | Text | Yes |

### Comments

| Column | Type | Required | Default |
|---|---|---|---|
| Body | Note | Yes | |
| SubjectId | Text | Yes | |
| SubjectType | Text | Yes | |
| AuthorId | Text | Yes | |
| Audience | Text | | Authenticated |

### SolutionUses

| Column | Type | Required | Default |
|---|---|---|---|
| SolutionId | Text | Yes | |
| StartedBy | Text | | |
| ProjectName | Text | Yes | |
| Team | Text | | |
| Status | Text | | Exploring |
| CompletedAt | Text | | |

### RequestSolutions

| Column | Type | Required | Default |
|---|---|---|---|
| RequestId | Text | Yes | |
| SolutionId | Text | Yes | |
| Relationship | Text | | Proposed |
| AddedBy | Text | | |

### Activity

| Column | Type | Required | Default |
|---|---|---|---|
| SubjectId | Text | Yes | |
| SubjectType | Choice | Yes | Request, Solution |
| Action | Text | | |
| ActorId | Text | | |
| Summary | Note | | |
| OccurredAt | DateTime | | [today] |

## Re-running

The script uses `Get-PnPList` and `Get-PnPField` checks before creating anything. Existing lists and fields are skipped with a yellow "already exists" message. No data is lost on re-run.
