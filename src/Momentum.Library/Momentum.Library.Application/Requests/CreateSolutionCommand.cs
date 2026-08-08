using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Solutions;

namespace Momentum.Library.Application.Requests;

public sealed record CreateSolutionCommand(
    UserId SubmittedBy,
    string Title,
    string Description,
    SolutionType Type,
    string RepositoryOwner,
    string RepositoryName,
    string RepositoryUrl,
    string? DemoUrl = null,
    IReadOnlyList<string>? Tags = null);
