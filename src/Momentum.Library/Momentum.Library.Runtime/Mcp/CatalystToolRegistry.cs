using System.ComponentModel;
using System.Text.Json;
using Momentum.Library.Application.Approvals;
using Momentum.Library.Application.Comments;
using Momentum.Library.Application.Engagement;
using Momentum.Library.Application.Ports;
using Momentum.Library.Application.Requests;
using Momentum.Library.Application.Search;
using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Identity;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Server;

namespace Momentum.Library.Runtime.Mcp;

public sealed class CatalystToolRegistry
{
    public CatalystToolRegistry() { }

    private static async Task<Role> GetRoleAsync(IServiceProvider services)
    {
        var identity = services.GetRequiredService<IIdentityProvider>();
        return await identity.GetCurrentUserRole();
    }

    [Description("Search solutions.")]
    [McpServerTool(Name = "search_solutions")]
    public static async Task<string> SearchSolutionsAsync(
        string query,
        int skip,
        int take,
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(services);
        McpAuthorizationPolicy.EnsureAuthorized("search_solutions", role);

        var handler = new SearchSolutionsHandler(services.GetRequiredService<ISolutionRepository>());
        var result = await handler.Handle(new SearchSolutionsQuery(query, skip, take));
        return JsonSerializer.Serialize(result);
    }

    [Description("Search requests.")]
    [McpServerTool(Name = "search_requests")]
    public static async Task<string> SearchRequestsAsync(
        string query,
        int skip,
        int take,
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(services);
        McpAuthorizationPolicy.EnsureAuthorized("search_requests", role);

        var handler = new SearchRequestsHandler(services.GetRequiredService<IRequestRepository>());
        var result = await handler.Handle(new SearchRequestsQuery(query, skip, take));
        return JsonSerializer.Serialize(result);
    }

    [Description("Get a request by id.")]
    [McpServerTool(Name = "get_request")]
    public static async Task<string> GetRequestAsync(
        string id,
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(services);
        McpAuthorizationPolicy.EnsureAuthorized("get_request", role);

        var handler = new RequestQueryHandler(services.GetRequiredService<IRequestRepository>());
        var result = await handler.GetById(id);
        return JsonSerializer.Serialize(result);
    }

    [Description("Create a request.")]
    [McpServerTool(Name = "create_request")]
    public static async Task<string> CreateRequestAsync(
        string title,
        string description,
        string type,
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(services);
        McpAuthorizationPolicy.EnsureAuthorized("create_request", role);

        var identity = services.GetRequiredService<IIdentityProvider>();
        var submitterId = await identity.GetCurrentUserId();
        if (!Enum.TryParse<Domain.Requests.RequestType>(type, true, out var requestType))
            requestType = Domain.Requests.RequestType.Backlog;
        var handler = new CreateRequestHandler(
            services.GetRequiredService<IRequestRepository>(),
            services.GetRequiredService<IEventPublisher>(),
            services.GetRequiredService<IAuditRepository>());
        var result = await handler.Handle(new CreateRequestCommand(submitterId, requestType, title, description));
        return JsonSerializer.Serialize(result);
    }

    [Description("Add a comment to a request or solution.")]
    [McpServerTool(Name = "add_comment")]
    public static async Task<string> AddCommentAsync(
        string subjectId,
        string body,
        CommentAudience audience,
        string subjectType,
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(services);
        McpAuthorizationPolicy.EnsureAuthorized("add_comment", role);

        var identity = services.GetRequiredService<IIdentityProvider>();
        var authorId = await identity.GetCurrentUserId();
        var subject = Enum.Parse<Domain.Engagement.HubItemType>(subjectType, true);
        var handler = new AddCommentHandler(
            services.GetRequiredService<ICommentRepository>(),
            services.GetRequiredService<IAuditRepository>());
        var result = await handler.Handle(new AddCommentCommand(subjectId, subject, authorId, role, audience, body));
        return JsonSerializer.Serialize(result);
    }

    [Description("Accept a request awaiting approval.")]
    [McpServerTool(Name = "accept_request")]
    public static async Task<string> AcceptRequestAsync(
        string requestId,
        string rationale,
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(services);
        McpAuthorizationPolicy.EnsureAuthorized("accept_request", role);

        var identity = services.GetRequiredService<IIdentityProvider>();
        var approverId = await identity.GetCurrentUserId();
        var handler = new AcceptRequestHandler(
            services.GetRequiredService<IRequestRepository>(),
            services.GetRequiredService<IAcceptanceDecisionRepository>(),
            services.GetRequiredService<IEventPublisher>(),
            identity,
            services.GetRequiredService<IAuditRepository>());
        var result = await handler.Handle(new AcceptRequestCommand(requestId, approverId, rationale));
        return JsonSerializer.Serialize(result);
    }

    [Description("Reject a request awaiting approval.")]
    [McpServerTool(Name = "reject_request")]
    public static async Task<string> RejectRequestAsync(
        string requestId,
        string rationale,
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(services);
        McpAuthorizationPolicy.EnsureAuthorized("reject_request", role);

        var identity = services.GetRequiredService<IIdentityProvider>();
        var approverId = await identity.GetCurrentUserId();
        var handler = new RejectRequestHandler(
            services.GetRequiredService<IRequestRepository>(),
            services.GetRequiredService<IAcceptanceDecisionRepository>(),
            identity,
            services.GetRequiredService<IAuditRepository>());
        var result = await handler.Handle(new RejectRequestCommand(requestId, approverId, rationale));
        return JsonSerializer.Serialize(result);
    }

    [Description("Vote for a request or solution.")]
    [McpServerTool(Name = "add_vote")]
    public static async Task<string> AddVoteAsync(
        string subjectType,
        string subjectId,
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        var role = await GetRoleAsync(services);
        McpAuthorizationPolicy.EnsureAuthorized("add_vote", role);

        var identity = services.GetRequiredService<IIdentityProvider>();
        var userId = await identity.GetCurrentUserId();
        var hubType = Enum.Parse<Domain.Engagement.HubItemType>(subjectType, true);
        var target = new Domain.Engagement.HubItemReference(hubType, subjectId);
        var handler = new AddVoteHandler(
            services.GetRequiredService<IVoteRepository>(),
            services.GetRequiredService<IEventPublisher>(),
            services.GetRequiredService<IAuditRepository>());
        var result = await handler.Handle(new AddVoteCommand(target, userId));
        return JsonSerializer.Serialize(result);
    }
}
