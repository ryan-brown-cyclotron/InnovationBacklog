using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Engagement;

public sealed record UpdateSolutionUseCommand(
    string SolutionUseId,
    UserId ActorId,
    SolutionUseStatus? Status,
    string? ProjectName,
    string? Team);
