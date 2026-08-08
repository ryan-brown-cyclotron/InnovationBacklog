using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Engagement;

public sealed record StartSolutionUseCommand(
    string SolutionId,
    UserId StartedBy,
    string ProjectName,
    string? Team,
    Domain.Engagement.SolutionUseStatus InitialStatus = Domain.Engagement.SolutionUseStatus.Exploring);
