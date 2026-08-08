using Momentum.Library.Application.Triage;

namespace Momentum.Library.Application.Requests;

public sealed record PublishRequestCommand(string RequestId, CreationTriageResult Result);
