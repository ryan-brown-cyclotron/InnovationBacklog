using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Application.Requests;

public sealed record SelectCanonicalSolutionCommand(string RequestId, string SolutionId, UserId SelectorId);
