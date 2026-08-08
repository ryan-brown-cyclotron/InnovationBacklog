using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Engagement;

public sealed record AddVoteCommand(HubItemReference Target, UserId UserId);
