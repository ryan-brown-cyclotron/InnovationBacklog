using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Engagement;

public sealed record RequestParticipationCommand(HubItemReference Target, UserId UserId, string Message);
