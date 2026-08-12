using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Momentum.Library.Application.Skills;
using Momentum.Library.Domain.Skills;
using Momentum.Mcp.Auth;

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
            Branch: string.IsNullOrWhiteSpace(body.Branch) ? "main" : body.Branch,
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
        catch (SkillIntakeException ex)
        {
            /*
                400 rather than 500: every SkillIntakeException describes something about
                the upload or its destination that the person who submitted it can fix —
                wrong file type, unsafe path, missing branch. A 500 would send them to an
                operator instead of to their own input.
            */
            logger.LogWarning(ex, "Skill intake rejected for {SkillName}.", body.SkillName);

            return new BadRequestObjectResult(new ProblemDetails
            {
                Title = "The skill could not be committed.",
                Detail = ex.Message,
                Status = StatusCodes.Status400BadRequest,
            });
        }
        catch (SkillRepositoryConflictException ex)
        {
            logger.LogWarning(ex, "Skill intake lost every retry for {SkillName}.", body.SkillName);

            return new ConflictObjectResult(new ProblemDetails
            {
                Title = "The branch is moving faster than this commit can be prepared.",
                Detail = ex.Message,
                Status = StatusCodes.Status409Conflict,
            });
        }
        catch (DownstreamTokenException ex)
        {
            logger.LogWarning(ex, "Skill intake could not obtain an Azure DevOps token.");

            return new ObjectResult(new ProblemDetails
            {
                Title = "Could not authenticate to Azure DevOps as the calling user.",
                Detail = ex.Message,
                Status = StatusCodes.Status403Forbidden,
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
    }
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
