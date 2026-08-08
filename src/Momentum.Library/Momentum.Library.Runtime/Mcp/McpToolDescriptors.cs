namespace Momentum.Library.Runtime.Mcp;

public sealed record ToolDescriptor(string Name, string Description, IReadOnlyList<ToolParameterDescriptor> Parameters, string RequiredRole);

public sealed record ToolParameterDescriptor(string Name, string Type, string Description, bool Required);

public static class McpToolDescriptors
{
    public static readonly IReadOnlyList<ToolDescriptor> All = new List<ToolDescriptor>
    {
        new("search_solutions", "Search solutions.", new[]
        {
            new ToolParameterDescriptor("query", "string", "Search query.", true),
            new ToolParameterDescriptor("skip", "integer", "Number of results to skip.", false),
            new ToolParameterDescriptor("take", "integer", "Number of results to return.", false)
        }, "Submitter"),
        new("search_requests", "Search requests.", new[]
        {
            new ToolParameterDescriptor("query", "string", "Search query.", true),
            new ToolParameterDescriptor("skip", "integer", "Number of results to skip.", false),
            new ToolParameterDescriptor("take", "integer", "Number of results to return.", false)
        }, "Submitter"),
        new("get_request", "Get a request by id.", new[]
        {
            new ToolParameterDescriptor("id", "string", "Request id.", true)
        }, "Submitter"),
        new("create_request", "Create a request.", new[]
        {
            new ToolParameterDescriptor("title", "string", "Request title.", true),
            new ToolParameterDescriptor("description", "string", "Request description.", true),
            new ToolParameterDescriptor("type", "string", "Request type: Backlog or Solution.", true)
        }, "Submitter"),
        new("add_comment", "Add a comment to a request or solution.", new[]
        {
            new ToolParameterDescriptor("subjectId", "string", "Subject id.", true),
            new ToolParameterDescriptor("body", "string", "Comment body.", true),
            new ToolParameterDescriptor("audience", "string", "Audience: Authenticated, SubmitterAndApprovers, or ApproversOnly.", true),
            new ToolParameterDescriptor("subjectType", "string", "Subject type: Request or Solution.", true)
        }, "Submitter"),
        new("accept_request", "Accept a request awaiting approval.", new[]
        {
            new ToolParameterDescriptor("requestId", "string", "Request id.", true),
            new ToolParameterDescriptor("rationale", "string", "Approval rationale.", true)
        }, "Approver"),
        new("reject_request", "Reject a request awaiting approval.", new[]
        {
            new ToolParameterDescriptor("requestId", "string", "Request id.", true),
            new ToolParameterDescriptor("rationale", "string", "Rejection rationale.", true)
        }, "Approver"),
        new("add_vote", "Vote for a request or solution.", new[]
        {
            new ToolParameterDescriptor("subjectType", "string", "Subject type.", true),
            new ToolParameterDescriptor("subjectId", "string", "Subject id.", true)
        }, "Submitter")
    };
}
