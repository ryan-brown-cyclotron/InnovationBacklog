using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Engagement;

public sealed record WithdrawContributionCommand(string ContributionId, UserId UserId);
