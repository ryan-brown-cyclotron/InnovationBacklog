using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Engagement;

public sealed record CompleteSolutionUseCommand(
    string SolutionUseId,
    UserId ActorId);
