using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Visibility;

namespace Momentum.Library.Application.Visibility;

public sealed record SetItemVisibilityCommand(
    HubItemReference Target,
    ItemVisibility Visibility,
    UserId ActorId,
    Role ActorRole);
