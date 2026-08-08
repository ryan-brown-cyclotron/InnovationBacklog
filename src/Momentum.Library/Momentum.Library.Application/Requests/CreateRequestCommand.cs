using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;

namespace Momentum.Library.Application.Requests;

public sealed record CreateRequestCommand(
    UserId SubmittedBy,
    RequestType Type,
    string Title,
    string Description,
    IReadOnlyList<string>? Tags = null);
