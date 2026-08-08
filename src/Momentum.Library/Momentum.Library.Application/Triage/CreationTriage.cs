using Momentum.Library.Domain.Events;

namespace Momentum.Library.Application.Triage;

public sealed record CreationTriageInput(string SubmissionId, string Title, string Description, string Context);

public sealed record CreationTriageResult
{
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string ClassificationHints { get; init; } = string.Empty;
    public string ApproverOnlyComment { get; init; } = string.Empty;
    public string SubmitterVisibleContext { get; init; } = string.Empty;
    public bool IsValid { get; init; } = true;
}
