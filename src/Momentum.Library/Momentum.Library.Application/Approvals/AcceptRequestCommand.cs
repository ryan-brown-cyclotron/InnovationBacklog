using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Approvals;

public sealed record AcceptRequestCommand(string RequestId, UserId ApproverId, string Rationale);
