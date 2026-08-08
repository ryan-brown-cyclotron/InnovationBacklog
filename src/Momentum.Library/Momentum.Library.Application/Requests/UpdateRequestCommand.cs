using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;

namespace Momentum.Library.Application.Requests;

public sealed record UpdateRequestCommand(string RequestId, UserId EditorId, string Title, string Description);
