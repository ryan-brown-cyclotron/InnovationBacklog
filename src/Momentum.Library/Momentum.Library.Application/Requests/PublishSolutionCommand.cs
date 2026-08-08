using Momentum.Library.Application.Triage;

namespace Momentum.Library.Application.Requests;

public sealed record PublishSolutionCommand(string RequestId, AcceptanceTriageResult Result);
