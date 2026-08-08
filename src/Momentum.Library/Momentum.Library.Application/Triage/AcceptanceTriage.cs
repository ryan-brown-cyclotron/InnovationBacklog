using Momentum.Library.Application.Ports;

namespace Momentum.Library.Application.Triage;

public sealed record AcceptanceTriageInput(
    string RequestId,
    string Title,
    string Description,
    string Context,
    RepositoryContent? RepositoryContent);

public sealed record AcceptanceTriageResult
{
    public string NormalizedTitle { get; init; } = string.Empty;
    public string NormalizedDescription { get; init; } = string.Empty;
    public string Domain { get; init; } = string.Empty;
    public string Type { get; init; } = string.Empty;
    public string IntendedUsers { get; init; } = string.Empty;
    public IReadOnlyList<string> Capabilities { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> Limitations { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> RecommendsSolutionIds { get; init; } = Array.Empty<string>();
    public string RepositoryReferenceOwner { get; init; } = string.Empty;
    public string RepositoryReferenceName { get; init; } = string.Empty;
    public string RepositoryReferenceUrl { get; init; } = string.Empty;
    public string RepositoryAssessment { get; init; } = string.Empty;
    public bool IsValid { get; init; } = true;
}
