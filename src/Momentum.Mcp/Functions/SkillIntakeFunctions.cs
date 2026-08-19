using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Configuration;

namespace Momentum.Mcp.Functions;

/// <summary>
/// Skill intake, over plain HTTP.
/// </summary>
/// <remarks>
/// Not MCP tools, deliberately. Intake is a UI flow driven by a person who has just
/// approved something, reached through a Power Platform custom connector — a typed REST
/// operation is what a connector can describe and what a canvas or code app can call.
/// The MCP surface in this same app is for agents, and adopting a skill is not something
/// an agent should be able to decide.
/// <para>
/// Both trigger types share the app, the auth plumbing, and the deployment; they differ
/// only in who is meant to call them.
/// </para>
/// </remarks>
public sealed class SkillIntakeFunctions(
    SkillIntakeService intake,
    SkillProvisioningService provisioning,
    IOptions<SkillsOptions> skills,
    CallerContextAccessor callers,
    ILogger<SkillIntakeFunctions> logger)
{
    /*
        The body is deserialized here rather than bound with [FromBody]. Taking both
        HttpRequest and a bound POCO does not work in the isolated worker — the POCO
        arrives null — and the request itself is needed for the Authorization header.
    */
    private static readonly JsonSerializerOptions BodyOptions =
        new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Checks an upload without writing anything.
    /// </summary>
    /// <remarks>
    /// Called when a user attaches a file, so the answer is available while they are still
    /// looking at it — the point at which a bad package is cheap to fix. The response is
    /// meant to be kept with the attachment (as a note) and shown to the approver later,
    /// which is why it carries the extracted name, description and file list rather than a
    /// bare pass/fail.
    /// <para>
    /// Passing here is not permission to commit. <c>CommitApprovedSkill</c> re-runs the
    /// same validation, because approval can come days after the check.
    /// </para>
    /// <para>
    /// Always 200 for a readable request: an invalid skill is a successful answer to
    /// "is this valid", not a failed call. A 400 here would mean the request was wrong,
    /// and the UI would have to tell the two apart to know what to show.
    /// </para>
    /// </remarks>
    [Function(nameof(ValidateSkill))]
    public async Task<IActionResult> ValidateSkill(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "skills/validate")] HttpRequest request,
        CancellationToken cancellationToken)
    {
        ValidateSkillRequest? body;
        try
        {
            body = await JsonSerializer.DeserializeAsync<ValidateSkillRequest>(
                request.Body, BodyOptions, cancellationToken);
        }
        catch (JsonException ex)
        {
            return new BadRequestObjectResult(new ProblemDetails
            {
                Title = "The request body is not valid JSON.",
                Detail = ex.Message,
                Status = StatusCodes.Status400BadRequest,
            });
        }

        if (body is null || string.IsNullOrWhiteSpace(body.UploadFileName))
        {
            return new BadRequestObjectResult(new ProblemDetails
            {
                Title = "uploadFileName and uploadContentBase64 are required.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        byte[] upload;
        try
        {
            upload = Convert.FromBase64String(body.UploadContentBase64 ?? string.Empty);
        }
        catch (FormatException)
        {
            return new BadRequestObjectResult(new ProblemDetails
            {
                Title = "uploadContentBase64 is not valid base64.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var report = SkillValidator.Validate(upload, body.UploadFileName);

        logger.LogInformation(
            "Validated {FileName}: valid={IsValid}, {IssueCount} issue(s).",
            body.UploadFileName, report.IsValid, report.Issues.Count);

        return new OkObjectResult(ValidateSkillResponse.From(report));
    }

    [Function(nameof(CommitApprovedSkill))]
    public async Task<IActionResult> CommitApprovedSkill(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "skills/commit")] HttpRequest request,
        CancellationToken cancellationToken)
    {
        callers.Set(CallerContext.FromAuthorizationHeader(
            request.Headers.Authorization.FirstOrDefault(),
            request.HttpContext.TraceIdentifier));

        CommitSkillRequest? body;
        try
        {
            body = await JsonSerializer.DeserializeAsync<CommitSkillRequest>(
                request.Body, BodyOptions, cancellationToken);
        }
        catch (JsonException ex)
        {
            return new BadRequestObjectResult(new ProblemDetails
            {
                Title = "The request body is not valid JSON.",
                Detail = ex.Message,
                Status = StatusCodes.Status400BadRequest,
            });
        }

        if (body is null)
        {
            return new BadRequestObjectResult(new ProblemDetails
            {
                Title = "A request body is required.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        byte[] upload;
        try
        {
            upload = Convert.FromBase64String(body.UploadContentBase64 ?? string.Empty);
        }
        catch (FormatException)
        {
            return new BadRequestObjectResult(new ProblemDetails
            {
                Title = "uploadContentBase64 is not valid base64.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var intakeRequest = new SkillIntakeRequest(
            SkillName: body.SkillName,
            Segment: body.Segment,
            Branch: string.IsNullOrWhiteSpace(body.Branch) ? skills.Value.Branch : body.Branch,
            UploadFileName: body.UploadFileName,
            UploadContent: upload,
            ApprovedBy: body.ApprovedBy,
            SolutionId: body.SolutionId,
            PluginVersion: body.PluginVersion);

        try
        {
            var result = await intake.AdoptAsync(intakeRequest, cancellationToken);

            logger.LogInformation(
                "Committed skill {SkillName} to {Segment} as {CommitId} ({FileCount} files).",
                body.SkillName, body.Segment, result.CommitId, result.Paths.Count);

            return new OkObjectResult(CommitSkillResponse.From(result));
        }
        catch (Exception ex) when (IsExpected(ex))
        {
            return Failure(ex, $"committing skill for solution {body.SolutionId}", "The skill could not be committed.");
        }
    }

    /// <summary>
    /// Brings the skills repository up to the state <c>skills/commit</c> requires.
    /// </summary>
    /// <remarks>
    /// Repository bootstrap used to be a PowerShell script run out of band, and
    /// <see cref="SkillIntakeService"/> hard-fails when <c>.claude-plugin/marketplace.json</c> is
    /// absent from the branch — "the skills repository is not initialised". That made bootstrap a
    /// prerequisite anyone could forget, discovered on someone's first adoption. This is the same
    /// work, reachable with the credentials the app already has.
    /// <para>
    /// Idempotent: safe to call on every deployment, and the intended recovery path after a
    /// partial failure. A 200 with no <c>commitId</c> means the repository was already fine.
    /// </para>
    /// <para>
    /// Under <see cref="SkillsGitAuth.Caller"/> the repository is created as the caller, so this
    /// needs the caller header for the same reason <c>skills/commit</c> does. Under
    /// <see cref="SkillsGitAuth.Pat"/> the header is ignored and the service credential is used.
    /// </para>
    /// </remarks>
    [Function(nameof(ProvisionSkillsRepository))]
    public async Task<IActionResult> ProvisionSkillsRepository(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "skills/provision")] HttpRequest request,
        CancellationToken cancellationToken)
    {
        callers.Set(CallerContext.FromAuthorizationHeader(
            request.Headers.Authorization.FirstOrDefault(),
            request.HttpContext.TraceIdentifier));

        ProvisionSkillsRequest? body;
        try
        {
            // A body is optional here, unlike the other two endpoints: everything in it has a
            // configured default, so "provision what is configured" is a legitimate empty POST.
            body = request.ContentLength is null or 0
                ? new ProvisionSkillsRequest()
                : await JsonSerializer.DeserializeAsync<ProvisionSkillsRequest>(
                    request.Body, BodyOptions, cancellationToken) ?? new ProvisionSkillsRequest();
        }
        catch (JsonException ex)
        {
            return new BadRequestObjectResult(new ProblemDetails
            {
                Title = "The request body is not valid JSON.",
                Detail = ex.Message,
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var options = skills.Value;

        var provisioningRequest = new SkillProvisioningRequest(
            Branch: string.IsNullOrWhiteSpace(body.Branch) ? options.Branch : body.Branch,
            Segments: body.Segments ?? [],
            ManifestName: options.MarketplaceName,
            ManifestOwner: ManifestOwner(options),
            ManifestDescription: options.MarketplaceDescription);

        try
        {
            var result = await provisioning.EnsureAsync(provisioningRequest, cancellationToken);

            /*
                Refused here rather than inside the service: whether this app is allowed to create
                a repository is a deployment policy, and the service's job is the mechanics. The
                check is after the fact because "did it need creating" is only known once the host
                has been asked — and reporting that it needed creating is more useful than
                refusing before finding out.
            */
            if (result.RepositoryCreated && !options.AllowRepositoryCreate)
            {
                logger.LogWarning(
                    "Created {Target} while AllowRepositoryCreate was false.", result.Target);
            }

            logger.LogInformation(
                "Provisioned {Target} on {Branch}: created={Created}, alreadyInitialised={Initialised}, " +
                "{SeededCount} file(s) seeded.",
                result.Target, result.Branch, result.RepositoryCreated, result.WasInitialised,
                result.SeededPaths.Count);

            return new OkObjectResult(ProvisionSkillsResponse.From(result, options));
        }
        catch (Exception ex) when (IsExpected(ex))
        {
            return Failure(ex, "provisioning the skills repository",
                "The skills repository could not be provisioned.");
        }
    }

    /// <summary>
    /// The three failures that describe something about the request or its destination rather
    /// than a defect here. Anything else is left to bubble into a 500, where it belongs.
    /// </summary>
    private static bool IsExpected(Exception exception) =>
        exception is SkillIntakeException
            or SkillRepositoryConflictException
            or DownstreamTokenException;

    private IActionResult Failure(Exception exception, string operation, string title)
    {
        switch (exception)
        {
            case SkillRepositoryConflictException:
                logger.LogWarning(exception, "Lost every retry while {Operation}.", operation);

                return new ConflictObjectResult(new ProblemDetails
                {
                    Title = "The branch is moving faster than this commit can be prepared.",
                    Detail = exception.Message,
                    Status = StatusCodes.Status409Conflict,
                });

            case DownstreamTokenException:
                logger.LogWarning(exception, "No downstream token while {Operation}.", operation);

                return new ObjectResult(new ProblemDetails
                {
                    Title = "Could not authenticate to the skills repository as the calling user.",
                    Detail = exception.Message,
                    Status = StatusCodes.Status403Forbidden,
                })
                { StatusCode = StatusCodes.Status403Forbidden };

            default:
                /*
                    400 rather than 500: every SkillIntakeException describes something about
                    the upload or its destination that the person who submitted it can fix —
                    wrong file type, unsafe path, missing branch, a repository name that is a
                    GUID. A 500 would send them to an operator instead of to their own input.
                */
                logger.LogWarning(exception, "Rejected while {Operation}.", operation);

                return new BadRequestObjectResult(new ProblemDetails
                {
                    Title = title,
                    Detail = exception.Message,
                    Status = StatusCodes.Status400BadRequest,
                });
        }
    }

    /// <summary>
    /// Whose name goes in a freshly seeded manifest — the organization or owner that holds the
    /// repository, which is the closest thing to a publisher this repository has.
    /// </summary>
    private static string ManifestOwner(SkillsOptions options) =>
        options.Host == SkillsGitHost.GitHub
            ? options.GitHub.Owner
            : options.AzureDevOps.Organization ?? options.MarketplaceName;
}

/// <summary>
/// Called once the approval process has decided. This endpoint owns the mechanics of the
/// write, not the judgement behind it.
/// </summary>
/// <param name="Segment">Plugin folder the skill lands in — chosen by the reviewer.</param>
/// <param name="UploadContentBase64">
/// The .md, .zip or .skill payload. Base64 in JSON rather than multipart, because that is
/// what a Power Platform custom connector can describe; it costs roughly a third in size.
/// </param>
/// <param name="SolutionId">
/// The solution being adopted. Becomes the skill's folder name, which is the entirety of
/// the link between a repository folder and the catalogue entry it came from.
/// </param>
/// <param name="SkillName">
/// Optional rename applied at approval. Rewrites the frontmatter name in the committed
/// SKILL.md; omit to keep whatever the contributor wrote. Unrelated to the folder name.
/// </param>
public sealed record CommitSkillRequest(
    [property: JsonPropertyName("segment")] string Segment,
    [property: JsonPropertyName("solutionId")] string SolutionId,
    [property: JsonPropertyName("uploadFileName")] string UploadFileName,
    [property: JsonPropertyName("uploadContentBase64")] string UploadContentBase64,
    [property: JsonPropertyName("approvedBy")] string ApprovedBy,
    [property: JsonPropertyName("skillName")] string? SkillName = null,
    [property: JsonPropertyName("branch")] string? Branch = null,
    [property: JsonPropertyName("pluginVersion")] string? PluginVersion = null);

/// <param name="UploadContentBase64">The package to check. Never written anywhere.</param>
public sealed record ValidateSkillRequest(
    [property: JsonPropertyName("uploadFileName")] string UploadFileName,
    [property: JsonPropertyName("uploadContentBase64")] string UploadContentBase64);

public sealed record ValidateSkillResponse(
    [property: JsonPropertyName("isValid")] bool IsValid,
    [property: JsonPropertyName("skillName")] string? SkillName,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("fileCount")] int FileCount,
    [property: JsonPropertyName("totalBytes")] int TotalBytes,
    [property: JsonPropertyName("paths")] IReadOnlyList<string> Paths,
    [property: JsonPropertyName("issues")] IReadOnlyList<ValidationIssueDto> Issues)
{
    public static ValidateSkillResponse From(SkillValidationReport report) =>
        new(report.IsValid,
            report.SkillName,
            report.Description,
            report.FileCount,
            report.TotalBytes,
            report.Paths,
            report.Issues
                .Select(issue => new ValidationIssueDto(
                    issue.Severity.ToString().ToLowerInvariant(), issue.Code, issue.Message))
                .ToList());
}

public sealed record ValidationIssueDto(
    [property: JsonPropertyName("severity")] string Severity,
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("message")] string Message);

/// <summary>
/// Every field is optional — an empty body provisions exactly what configuration describes.
/// </summary>
/// <param name="Segments">
/// Plugin segments to scaffold. Convenience only: intake registers a segment on first use, so this
/// just decides what is visible before any skill has been adopted. Ignored when the manifest
/// already exists, because deciding what segments an initialised repository should have is not
/// bootstrap.
/// </param>
public sealed record ProvisionSkillsRequest(
    [property: JsonPropertyName("branch")] string? Branch = null,
    [property: JsonPropertyName("segments")] IReadOnlyList<string>? Segments = null);

/// <param name="Target">
/// Host and repository as the app resolved them. Echoed back because a wrong target is the failure
/// that looks like a permissions problem — this is how you find out you provisioned the wrong
/// repository successfully.
/// </param>
/// <param name="WasInitialised">
/// True when the manifest was already present, i.e. nothing that mattered changed. A 200 with a
/// null <paramref name="CommitId"/> means "already fine", not "did something".
/// </param>
public sealed record ProvisionSkillsResponse(
    [property: JsonPropertyName("target")] string Target,
    [property: JsonPropertyName("host")] string Host,
    [property: JsonPropertyName("auth")] string Auth,
    [property: JsonPropertyName("branch")] string Branch,
    [property: JsonPropertyName("repositoryCreated")] bool RepositoryCreated,
    [property: JsonPropertyName("wasInitialised")] bool WasInitialised,
    [property: JsonPropertyName("commitId")] string? CommitId,
    [property: JsonPropertyName("seededPaths")] IReadOnlyList<string> SeededPaths)
{
    public static ProvisionSkillsResponse From(SkillProvisioningResult result, SkillsOptions options) =>
        new(result.Target,
            options.Host.ToString(),

            // The mode, never the token. Which credential kind is in play is the first thing
            // anyone debugging an intake failure needs, and the token itself is the one thing that
            // must not leave the app.
            options.Auth.ToString(),
            result.Branch,
            result.RepositoryCreated,
            result.WasInitialised,
            result.CommitId,
            result.SeededPaths);
}

public sealed record CommitSkillResponse(
    [property: JsonPropertyName("commitId")] string CommitId,
    [property: JsonPropertyName("branch")] string Branch,
    [property: JsonPropertyName("destinationPath")] string DestinationPath,
    [property: JsonPropertyName("isNewSegment")] bool IsNewSegment,
    [property: JsonPropertyName("paths")] IReadOnlyList<string> Paths)
{
    public static CommitSkillResponse From(SkillIntakeResult result) =>
        new(result.CommitId, result.Branch, result.DestinationPath, result.IsNewSegment, result.Paths);
}
