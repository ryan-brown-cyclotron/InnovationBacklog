using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Requests;

public sealed record UnlinkSolutionFromRequestCommand(string RequestId, string SolutionId, UserId RemovedBy);
