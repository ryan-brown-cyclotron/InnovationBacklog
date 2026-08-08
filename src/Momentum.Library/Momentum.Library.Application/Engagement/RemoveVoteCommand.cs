using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Engagement;

public sealed record RemoveVoteCommand(HubItemReference Target, UserId UserId);
