using Microsoft.AspNetCore.Mvc;
using Momentum.Contracts;
using Momentum.Library.Application.Approvals;
using Momentum.Library.Application.Comments;
using Momentum.Library.Application.Engagement;
using Momentum.Library.Application.Ports;
using Momentum.Library.Application.Requests;
using Momentum.Library.Application.Search;
using Momentum.Library.Domain.Auditing;
using Momentum.Library.Domain.Comments;
using Momentum.Library.Domain.Engagement;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Solutions;
using Momentum.Library.Domain.Visibility;
using Momentum.Library.Application.Visibility;

namespace Momentum.Service.Api;

public static class CatalystApiEndpoints
{
    private const int MaxAttachmentBytes = 10 * 1024 * 1024;

    public static IEndpointRouteBuilder MapCatalystApi(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/api");

        api.MapPost("/requests", async (
            CreateRequestRequest request,
            IIdentityProvider identity,
            IRequestRepository requests,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            var submitterId = await identity.GetCurrentUserId();
            var requestType = ParseRequestType(request.Type);
            var result = await new CreateRequestHandler(requests, events, audit)
                .Handle(new CreateRequestCommand(
                    submitterId, requestType, request.Title, request.Description, request.Tags));
            return Results.Created($"/api/requests/{result.Id}", ToRequestResponse(result));
        });

        api.MapPost("/solutions", async (
            CreateSolutionRequest request,
            IIdentityProvider identity,
            ISolutionRepository solutions,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            var submitterId = await identity.GetCurrentUserId();
            if (!Enum.TryParse<SolutionType>(request.SolutionType, true, out var solutionType))
                solutionType = SolutionType.Library;
            var command = new CreateSolutionCommand(
                submitterId,
                request.Title,
                request.Description,
                solutionType,
                request.RepositoryOwner,
                request.RepositoryName,
                request.RepositoryUrl,
                request.DemoUrl,
                request.Tags);
            var result = await new CreateSolutionHandler(solutions, events, audit).Handle(command);
            return Results.Created($"/api/solutions/{result.Id}", ToSolutionResponse(result));
        });

        api.MapGet("/requests", async (IIdentityProvider identity, IRequestRepository requests) =>
        {
            var userId = await identity.GetCurrentUserId();
            var items = await requests.GetBySubmitter(userId);
            return Results.Ok(items.Select(ToRequestResponse).ToList());
        });

        api.MapGet("/requests/{id}", async (string id, IIdentityProvider identity, IRequestRepository requests) =>
        {
            var request = await requests.GetById(id);
            if (request is null) return Results.NotFound();
            // An item you may not see reads as absent; a 403 would confirm it exists.
            return await CanReadRequest(identity, request) ? Results.Ok(ToRequestResponse(request)) : Results.NotFound();
        });

        api.MapPatch("/requests/{id}", async (
            string id,
            UpdateRequestRequest request,
            IIdentityProvider identity,
            IRequestRepository requests,
            IAuditRepository audit) =>
        {
            var editorId = await identity.GetCurrentUserId();
            var result = await new UpdateRequestHandler(requests, audit)
                .Handle(new UpdateRequestCommand(id, editorId, request.Title, request.Description));
            return Results.Ok(ToRequestResponse(result));
        });

        api.MapGet("/requests/{id}/comments", async (
            string id,
            IIdentityProvider identity,
            IRequestRepository requests,
            ICommentRepository comments) =>
        {
            var request = await requests.GetById(id);
            if (request is null) return Results.NotFound();
            if (!await CanReadRequest(identity, request)) return Results.NotFound();
            var role = await identity.GetCurrentUserRole();
            var results = await comments.GetBySubject(id, HubItemType.Request, CommentAudienceFilter.ForRole(role));
            return Results.Ok(results.Select(ToCommentResponse).ToList());
        });

        api.MapPost("/requests/{id}/comments", async (
            string id,
            AddCommentRequest request,
            IIdentityProvider identity,
            IRequestRepository requests,
            ICommentRepository comments,
            IAttachmentStore attachments,
            IAuditRepository audit) =>
        {
            var subj = await requests.GetById(id);
            if (subj is null) return Results.NotFound();
            if (!await CanReadRequest(identity, subj)) return Results.NotFound();
            if (!Enum.TryParse<CommentAudience>(request.Audience, true, out var audience))
                return Results.BadRequest(new { error = "Invalid comment audience." });
            if (!Enum.TryParse<HubItemType>(request.SubjectType, true, out var subjectType))
                subjectType = HubItemType.Request;

            var (resolved, attachmentError) = await ResolveAttachments(attachments, request.AttachmentIds);
            if (attachmentError is not null) return Results.BadRequest(new { error = attachmentError });

            var authorId = await identity.GetCurrentUserId();
            var role = await identity.GetCurrentUserRole();
            var result = await new AddCommentHandler(comments, audit)
                .Handle(new AddCommentCommand(id, subjectType, authorId, role, audience, request.Body, resolved));
            return Results.Ok(ToCommentResponse(result));
        });

        // Administrators decide who can see an item. Both routes share one
        // handler so the role check cannot drift between them.
        api.MapPatch("/requests/{id}/visibility", async (
            string id,
            SetVisibilityRequest body,
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IAuditRepository audit) =>
            await ChangeVisibility(HubItemType.Request, id, body, identity, requests, solutions, audit));

        api.MapPatch("/solutions/{id}/visibility", async (
            string id,
            SetVisibilityRequest body,
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IAuditRepository audit) =>
            await ChangeVisibility(HubItemType.Solution, id, body, identity, requests, solutions, audit));

        // Everything waiting on a reviewer. Ideas sit in any pre-decision status
        // — triage does not run in every deployment, so "Created" is a queue
        // entry too, not a state only an agent can move on from.
        api.MapGet("/approvals/inbox", async (IIdentityProvider identity, IRequestRepository requests) =>
        {
            if (!IsApprover(await identity.GetCurrentUserRole())) return Forbidden();
            var pending = await PendingRequests(requests);
            return Results.Ok(pending.Select(ToRequestResponse).ToList());
        });

        api.MapGet("/approvals/solutions", async (IIdentityProvider identity, ISolutionRepository solutions) =>
        {
            if (!IsApprover(await identity.GetCurrentUserRole())) return Forbidden();
            var all = await solutions.Search(string.Empty, 0, 500);
            var pending = all
                .Where(item => ApprovalStates.Of(item.Status) == ApprovalState.Pending)
                .OrderBy(item => item.CreatedAt)
                .Select(ToSolutionResponse)
                .ToList();
            return Results.Ok(pending);
        });

        api.MapGet("/approvals/links", async (
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IRequestSolutionRepository relationships) =>
        {
            if (!IsApprover(await identity.GetCurrentUserRole())) return Forbidden();

            var pending = new List<PendingLinkResponse>();
            foreach (var request in await AllRequests(requests))
            {
                foreach (var link in await relationships.GetByRequest(request.Id))
                {
                    if (link.Approval != ApprovalState.Pending) continue;
                    var solution = await solutions.GetById(link.SolutionId);
                    if (solution is null) continue;
                    pending.Add(new PendingLinkResponse(
                        request.Id,
                        request.Title,
                        solution.Id,
                        solution.Title,
                        link.Relationship.ToString(),
                        link.AddedBy.Value,
                        link.AddedAt.ToString("O")));
                }
            }
            return Results.Ok(pending.OrderBy(item => item.AddedAt).ToList());
        });

        api.MapPost("/solutions/{id}/accept", async (
            string id,
            AcceptanceDecisionRequest request,
            IIdentityProvider identity,
            ISolutionRepository solutions,
            IEventPublisher events,
            IAuditRepository audit) =>
            await ReviewSolution(id, request.Rationale, accept: true, identity, solutions, events, audit));

        api.MapPost("/solutions/{id}/reject", async (
            string id,
            AcceptanceDecisionRequest request,
            IIdentityProvider identity,
            ISolutionRepository solutions,
            IEventPublisher events,
            IAuditRepository audit) =>
            await ReviewSolution(id, request.Rationale, accept: false, identity, solutions, events, audit));

        api.MapPost("/requests/{requestId}/links/{solutionId}/accept", async (
            string requestId,
            string solutionId,
            AcceptanceDecisionRequest request,
            IIdentityProvider identity,
            IRequestSolutionRepository relationships,
            IAuditRepository audit) =>
            await ReviewLink(requestId, solutionId, request.Rationale, accept: true, identity, relationships, audit));

        api.MapPost("/requests/{requestId}/links/{solutionId}/reject", async (
            string requestId,
            string solutionId,
            AcceptanceDecisionRequest request,
            IIdentityProvider identity,
            IRequestSolutionRepository relationships,
            IAuditRepository audit) =>
            await ReviewLink(requestId, solutionId, request.Rationale, accept: false, identity, relationships, audit));

        api.MapPost("/requests/{id}/accept", async (
            string id,
            AcceptanceDecisionRequest request,
            IIdentityProvider identity,
            IRequestRepository requests,
            IAcceptanceDecisionRepository decisions,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            var approverId = await identity.GetCurrentUserId();
            var handler = new AcceptRequestHandler(requests, decisions, events, identity, audit);
            return Results.Ok(await handler.Handle(new AcceptRequestCommand(id, approverId, request.Rationale)));
        });

        api.MapPost("/requests/{id}/reject", async (
            string id,
            AcceptanceDecisionRequest request,
            IIdentityProvider identity,
            IRequestRepository requests,
            IAcceptanceDecisionRepository decisions,
            IAuditRepository audit) =>
        {
            var approverId = await identity.GetCurrentUserId();
            var handler = new RejectRequestHandler(requests, decisions, identity, audit);
            return Results.Ok(await handler.Handle(new RejectRequestCommand(id, approverId, request.Rationale)));
        });

        api.MapGet("/requests/{id}/decisions", async (
            string id,
            IIdentityProvider identity,
            IAcceptanceDecisionRepository decisions) =>
        {
            if (!IsApprover(await identity.GetCurrentUserRole())) return Forbidden();
            return Results.Ok(await decisions.GetByRequest(id));
        });

        api.MapGet("/requests/{id}/activity", async (
            string id,
            IIdentityProvider identity,
            IRequestRepository requests,
            IAuditRepository audit) =>
        {
            var req = await requests.GetById(id);
            if (req is null) return Results.NotFound();
            if (!await CanReadRequest(identity, req)) return Results.NotFound();

            var role = await identity.GetCurrentUserRole();
            var records = await audit.GetBySubject(id);
            return Results.Ok(FilterAudit(records, role).Select(ToActivityItem).ToList());
        });

        api.MapPost("/requests/{id}/link", async (
            string id,
            LinkSolutionRequestBody body,
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IRequestSolutionRepository relationships,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            var request = await requests.GetById(id);
            if (request is null) return Results.NotFound();
            if (!await CanReadRequest(identity, request)) return Results.NotFound();
            if (!TryGetRelationship(body.Relationship, out var rel, out var relError))
                return Results.BadRequest(new { error = relError });
            var actorId = await identity.GetCurrentUserId();
            var actorRole = await identity.GetCurrentUserRole();
            var link = await new LinkSolutionToRequestHandler(requests, solutions, relationships, events, audit)
                .Handle(new LinkSolutionToRequestCommand(id, body.SolutionId, rel, actorId, actorRole));
            return Results.Ok(link);
        });

        api.MapPost("/requests/{id}/unlink", async (
            string id,
            LinkSolutionRequestBody body,
            IIdentityProvider identity,
            IRequestRepository requests,
            IRequestSolutionRepository relationships,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            var request = await requests.GetById(id);
            if (request is null) return Results.NotFound();
            if (!await CanReadRequest(identity, request)) return Results.NotFound();
            var actorId = await identity.GetCurrentUserId();
            await new UnlinkSolutionFromRequestHandler(relationships, events, audit)
                .Handle(new UnlinkSolutionFromRequestCommand(id, body.SolutionId, actorId));
            return Results.NoContent();
        });

        api.MapPost("/requests/{id}/canonical", async (
            string id,
            SelectCanonicalSolutionRequestBody body,
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IRequestSolutionRepository relationships,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            var request = await requests.GetById(id);
            if (request is null) return Results.NotFound();
            if (!IsApprover(await identity.GetCurrentUserRole())) return Forbidden();
            var selectorId = await identity.GetCurrentUserId();
            await new SelectCanonicalSolutionHandler(requests, solutions, relationships, events, audit)
                .Handle(new SelectCanonicalSolutionCommand(id, body.SolutionId, selectorId));
            return Results.NoContent();
        });

        // Same envelope as /api/search so every client reads `itemId` for a
        // solution regardless of which endpoint produced it.
        api.MapGet("/solutions", async (
            string? query,
            int? skip,
            int? take,
            IIdentityProvider identity,
            ISolutionRepository solutions) =>
        {
            var result = await new SearchSolutionsHandler(solutions)
                .Handle(new SearchSolutionsQuery(query ?? string.Empty, skip ?? 0, Math.Clamp(take ?? 25, 1, 100)));
            var visible = await FilterVisibleSolutions(identity, result.Items);
            return Results.Ok(new SearchResponse(visible.Select(ToSearchItem).ToList(), visible.Count));
        });

        api.MapGet("/solutions/{id}", async (
            string id,
            IIdentityProvider identity,
            ISolutionRepository solutions) =>
        {
            var solution = await solutions.GetById(id);
            // A hidden item must read as absent, not as forbidden.
            if (solution is null || !await CanSeeSolution(identity, solution)) return Results.NotFound();
            return Results.Ok(ToSolutionResponse(solution));
        });

        api.MapGet("/requests/{id}/solutions", async (
            string id,
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IRequestSolutionRepository relationships) =>
        {
            var request = await requests.GetById(id);
            if (request is null) return Results.NotFound();
            if (!await CanReadRequest(identity, request)) return Results.NotFound();

            var links = await VisibleLinks(identity, await relationships.GetByRequest(id));
            var linked = await Task.WhenAll(links.Select(link => solutions.GetById(link.SolutionId)));
            // A link must not become a way around a solution's own visibility.
            var visible = await FilterVisibleSolutions(identity, linked.Where(item => item is not null)!);
            return Results.Ok(visible.Select(ToSolutionResponse).ToList());
        });

        api.MapGet("/solutions/{id}/requests", async (
            string id,
            IIdentityProvider identity,
            ISolutionRepository solutions,
            IRequestRepository requests,
            IRequestSolutionRepository relationships) =>
        {
            var solution = await solutions.GetById(id);
            if (solution is null || !await CanSeeSolution(identity, solution)) return Results.NotFound();

            var links = await VisibleLinks(identity, await relationships.GetBySolution(id));
            var linked = await Task.WhenAll(links.Select(link => requests.GetById(link.RequestId)));
            // A link must not become a way around an idea's own visibility.
            var visible = await FilterVisibleRequests(identity, linked.Where(item => item is not null)!);
            return Results.Ok(visible.Select(ToRequestResponse).ToList());
        });

        api.MapGet("/solutions/{id}/comments", async (
            string id,
            IIdentityProvider identity,
            ISolutionRepository solutions,
            ICommentRepository comments) =>
        {
            var solution = await solutions.GetById(id);
            if (solution is null || !await CanSeeSolution(identity, solution)) return Results.NotFound();
            var role = await identity.GetCurrentUserRole();
            var results = await comments.GetBySubject(id, HubItemType.Solution, CommentAudienceFilter.ForRole(role));
            return Results.Ok(results.Select(ToCommentResponse).ToList());
        });

        api.MapPost("/solutions/{id}/comments", async (
            string id,
            AddCommentRequest request,
            IIdentityProvider identity,
            ISolutionRepository solutions,
            ICommentRepository comments,
            IAttachmentStore attachments,
            IAuditRepository audit) =>
        {
            var solution = await solutions.GetById(id);
            if (solution is null || !await CanSeeSolution(identity, solution)) return Results.NotFound();
            if (!Enum.TryParse<CommentAudience>(request.Audience, true, out var audience))
                return Results.BadRequest(new { error = "Invalid comment audience." });

            var (resolved, attachmentError) = await ResolveAttachments(attachments, request.AttachmentIds);
            if (attachmentError is not null) return Results.BadRequest(new { error = attachmentError });

            var authorId = await identity.GetCurrentUserId();
            var role = await identity.GetCurrentUserRole();
            var result = await new AddCommentHandler(comments, audit)
                .Handle(new AddCommentCommand(id, HubItemType.Solution, authorId, role, audience, request.Body, resolved));
            return Results.Ok(ToCommentResponse(result));
        });

        api.MapGet("/solutions/{id}/activity", async (
            string id,
            IIdentityProvider identity,
            ISolutionRepository solutions,
            IAuditRepository audit) =>
        {
            var solution = await solutions.GetById(id);
            if (solution is null || !await CanSeeSolution(identity, solution)) return Results.NotFound();
            var role = await identity.GetCurrentUserRole();
            var records = await audit.GetBySubject(id);
            return Results.Ok(FilterAudit(records, role).Select(ToActivityItem).ToList());
        });

        api.MapGet("/search", async (string? query, int? skip, int? take,
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions) =>
        {
            var effectiveQuery = query ?? string.Empty;
            var pageSize = Math.Clamp(take ?? 25, 1, 100);
            var searchRequests = await new SearchRequestsHandler(requests)
                .Handle(new SearchRequestsQuery(effectiveQuery, skip ?? 0, pageSize));
            var searchSolutions = await new SearchSolutionsHandler(solutions)
                .Handle(new SearchSolutionsQuery(effectiveQuery, skip ?? 0, pageSize));

            var visibleRequests = await FilterVisibleRequests(identity, searchRequests.Items);
            var visibleSolutions = await FilterVisibleSolutions(identity, searchSolutions.Items);
            var items = visibleRequests
                .Select(ToSearchItem)
                .Concat(visibleSolutions.Select(ToSearchItem))
                .ToList();
            return Results.Ok(new SearchResponse(items, items.Count));
        });

        // Upvote state for one item. The UI needs `votedByMe` to render the
        // toggle; a bare count cannot tell "vote" from "remove vote".
        api.MapGet("/votes", async (
            string? itemType,
            string? itemId,
            IIdentityProvider identity,
            IVoteRepository votes) =>
        {
            if (!TryGetTarget(itemType, itemId, out var target, out var error))
                return Results.BadRequest(new { error });
            var userId = await identity.GetCurrentUserId();
            var cast = await votes.GetByTarget(target);
            return Results.Ok(new VoteSummaryResponse(
                target.ItemType.ToString(),
                target.ItemId,
                cast.Count,
                cast.Any(vote => vote.UserId.Value == userId.Value)));
        });

        api.MapPost("/votes", async (
            AddVoteRequest request,
            IIdentityProvider identity,
            IVoteRepository votes,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            if (!TryGetTarget(request.ItemType, request.ItemId, out var target, out var error))
                return Results.BadRequest(new { error });
            var userId = await identity.GetCurrentUserId();
            var result = await new AddVoteHandler(votes, events, audit)
                .Handle(new AddVoteCommand(target, userId));
            return Results.Ok(new { result.Id, result.Target.ItemType, result.Target.ItemId });
        });

        api.MapDelete("/votes", async (
            [FromBody] RemoveVoteRequest request,
            IIdentityProvider identity,
            IVoteRepository votes,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            if (!TryGetTarget(request.ItemType, request.ItemId, out var target, out var error))
                return Results.BadRequest(new { error });
            var userId = await identity.GetCurrentUserId();
            await new RemoveVoteHandler(votes, events, audit)
                .Handle(new RemoveVoteCommand(target, userId));
            return Results.NoContent();
        });

        api.MapPost("/solutions/{id}/use", async (
            string id,
            StartSolutionUseRequest request,
            IIdentityProvider identity,
            ISolutionUseRepository uses,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            if (string.IsNullOrWhiteSpace(request.ProjectName))
                return Results.BadRequest(new { error = "ProjectName is required." });
            var status = ParseSolutionUseStatus(request.Status);
            var userId = await identity.GetCurrentUserId();
            var result = await new StartSolutionUseHandler(uses, events, audit)
                .Handle(new StartSolutionUseCommand(id, userId, request.ProjectName, request.Team, status));
            return Results.Created($"/api/solutions/{id}/use/{result.Id}", ToSolutionUseResponse(result));
        });

        api.MapGet("/solutions/{id}/use", async (string id, ISolutionUseRepository uses) =>
        {
            var items = await uses.GetBySolution(id);
            return Results.Ok(items.Select(ToSolutionUseResponse).ToList());
        });

        api.MapPatch("/solutions/{id}/use/{useId}", async (
            string id,
            string useId,
            UpdateSolutionUseRequest request,
            IIdentityProvider identity,
            ISolutionUseRepository uses,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            if (!TryGetSolutionUseStatusNullable(request.Status, out var status, out var statusError))
                return Results.BadRequest(new { error = statusError });
            var userId = await identity.GetCurrentUserId();
            var result = await new UpdateSolutionUseHandler(uses, events, audit)
                .Handle(new UpdateSolutionUseCommand(useId, userId, status, request.ProjectName, request.Team));
            return Results.Ok(ToSolutionUseResponse(result));
        });

        api.MapPost("/solutions/{id}/use/{useId}/complete", async (
            string id,
            string useId,
            IIdentityProvider identity,
            ISolutionUseRepository uses,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            var userId = await identity.GetCurrentUserId();
            var result = await new CompleteSolutionUseHandler(uses, events, audit)
                .Handle(new CompleteSolutionUseCommand(useId, userId));
            return Results.Ok(ToSolutionUseResponse(result));
        });

        // The hub feed: recent audit records the caller is allowed to see, on
        // items the caller is allowed to see.
        api.MapGet("/activity", async (
            int? take,
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IAuditRepository audit) =>
        {
            var role = await identity.GetCurrentUserRole();
            var pageSize = Math.Clamp(take ?? 50, 1, 200);
            // Over-fetch: visibility filtering below removes rows.
            var records = await audit.GetRecent(pageSize * 4);

            var visibleSubjects = await VisibleSubjectIds(identity, requests, solutions);
            var items = FilterAudit(records, role)
                .Where(record => visibleSubjects.Contains(record.SubjectId))
                .OrderByDescending(record => record.OccurredAt)
                .Take(pageSize)
                .Select(ToActivityItem)
                .ToList();
            return Results.Ok(items);
        });

        // Engagement counts keyed by item id — the shape the workspace hooks
        // expect, so lists can show upvotes, momentum, and adoption.
        api.MapGet("/requests/summary", async (
            IIdentityProvider identity,
            IRequestRepository requests,
            IRequestSolutionRepository relationships,
            ICommentRepository comments,
            IVoteRepository votes) =>
        {
            var userId = await identity.GetCurrentUserId();
            var role = await identity.GetCurrentUserRole();
            var all = await AllRequests(requests);
            var visible = all.Where(r => ItemVisibilityRules.CanSee(r.Visibility, role, r.SubmittedBy == userId));

            var since = DateTimeOffset.UtcNow.AddDays(-30);
            var summary = new Dictionary<string, RequestSummaryEntry>();
            foreach (var request in visible)
            {
                var target = HubItemReference.ForRequest(request.Id);
                var cast = await votes.GetByTarget(target);
                var linked = await VisibleLinks(identity, await relationships.GetByRequest(request.Id));
                var discussion = await comments.GetBySubject(
                    request.Id, HubItemType.Request, CommentAudienceFilter.ForRole(role));

                var contributors = cast.Select(v => v.UserId.Value)
                    .Concat(discussion.Select(c => c.AuthorId.Value))
                    .Append(request.SubmittedBy.Value)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Count();

                summary[request.Id] = new RequestSummaryEntry(
                    cast.Count,
                    cast.Count(v => v.CreatedAt >= since),
                    cast.Any(v => v.UserId.Value == userId.Value),
                    linked.Count,
                    contributors,
                    discussion.Count);
            }
            return Results.Ok(summary);
        });

        api.MapGet("/solutions/summary", async (
            IIdentityProvider identity,
            ISolutionRepository solutions,
            IRequestSolutionRepository relationships,
            ICommentRepository comments,
            IVoteRepository votes,
            ISolutionUseRepository uses) =>
        {
            var userId = await identity.GetCurrentUserId();
            var role = await identity.GetCurrentUserRole();
            var all = await solutions.Search(string.Empty, 0, 500);
            var visible = await FilterVisibleSolutions(identity, all);

            var summary = new Dictionary<string, SolutionSummaryEntry>();
            foreach (var solution in visible)
            {
                var solutionUses = await uses.GetBySolution(solution.Id);
                var linked = await VisibleLinks(identity, await relationships.GetBySolution(solution.Id));
                var cast = await votes.GetByTarget(HubItemReference.ForSolution(solution.Id));
                var discussion = await comments.GetBySubject(
                    solution.Id, HubItemType.Solution, CommentAudienceFilter.ForRole(role));
                var teams = solutionUses
                    .Select(use => string.IsNullOrWhiteSpace(use.Team) ? use.ProjectName : use.Team!)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Count();

                summary[solution.Id] = new SolutionSummaryEntry(
                    solutionUses.Count,
                    teams,
                    linked.Count,
                    solutionUses.Count(use => use.CompletedAt is null),
                    solutionUses.Count(use => use.CompletedAt is not null),
                    cast.Count,
                    cast.Any(vote => vote.UserId.Value == userId.Value),
                    discussion.Count);
            }
            return Results.Ok(summary);
        });

        /*
         * Programme-level numbers for the dashboard.
         *
         * Computed live from the repositories, for the same reason the engagement
         * summaries above are: there is no rollup table, and a cache nobody
         * invalidates is worse than no cache. Everything is visibility-filtered
         * first, so two people can legitimately see different totals — a dashboard
         * that leaked the count of items you cannot see would leak that they exist.
         *
         * The code app computes the same shape from Azure DevOps work items and
         * Dataverse rows. Where the two hosts cannot measure a figure the same way
         * they say so in `Source` rather than quietly differing.
         */
        api.MapGet("/insights", async (
            IIdentityProvider identity,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IRequestSolutionRepository relationships,
            IAcceptanceDecisionRepository decisions,
            ICommentRepository comments,
            IVoteRepository votes,
            ISolutionUseRepository uses,
            IContributionRepository contributions,
            IAuditRepository auditLog) =>
        {
            const int staleAfterDays = 21;
            var now = DateTimeOffset.UtcNow;
            var windowStart = now.AddDays(-30);
            var priorStart = now.AddDays(-60);

            var userId = await identity.GetCurrentUserId();
            var role = await identity.GetCurrentUserRole();

            var allRequests = (await AllRequests(requests))
                .Where(r => ItemVisibilityRules.CanSee(r.Visibility, role, r.SubmittedBy == userId))
                .ToList();
            var allSolutions = await FilterVisibleSolutions(
                identity, await solutions.Search(string.Empty, 0, 500));
            // Same rule the activity feed uses: a dashboard that counted items you
            // cannot see would leak the fact that they exist.
            var visibleSubjects = allRequests.Select(item => item.Id)
                .Concat(allSolutions.Select(item => item.Id))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            // --------------------------------------------------------- ideas
            var submitted30d = allRequests.Count(r => r.CreatedAt >= windowStart);
            var submittedPrior30d = allRequests.Count(
                r => r.CreatedAt >= priorStart && r.CreatedAt < windowStart);
            var awaiting = allRequests.Where(r => r.Status == RequestStatus.AwaitingApproval).ToList();
            var approved = allRequests.Count(r => r.Status == RequestStatus.Accepted);
            var stale = awaiting.Count(r => (now - r.CreatedAt).TotalDays > staleAfterDays);

            // ----------------------------------------------- approval durations
            // Exact here, unlike the code app: the decision record carries the moment
            // it was made, so no revision history or audit row has to stand in for it.
            var durations = new List<double>();
            var linkedIdeas = 0;
            foreach (var request in allRequests)
            {
                var settled = (await decisions.GetByRequest(request.Id))
                    .OrderBy(d => d.DecidedAt)
                    .FirstOrDefault();
                if (settled is not null && settled.DecidedAt >= request.CreatedAt)
                    durations.Add((settled.DecidedAt - request.CreatedAt).TotalDays);

                var links = await VisibleLinks(identity, await relationships.GetByRequest(request.Id));
                if (links.Count > 0) linkedIdeas++;
            }
            durations.Sort();

            // --------------------------------------------------------- votes
            var perVoter = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var votes30d = 0;
            var totalVotes = 0;
            var comments30d = 0;
            foreach (var target in allRequests
                .Select(r => HubItemReference.ForRequest(r.Id))
                .Concat(allSolutions.Select(s => HubItemReference.ForSolution(s.Id))))
            {
                foreach (var vote in await votes.GetByTarget(target))
                {
                    totalVotes++;
                    if (vote.CreatedAt >= windowStart) votes30d++;
                    var key = vote.UserId.Value;
                    perVoter[key] = perVoter.TryGetValue(key, out var count) ? count + 1 : 1;
                }

                var subjectType = target.ItemType;
                var discussion = await comments.GetBySubject(
                    target.ItemId, subjectType, CommentAudienceFilter.ForRole(role));
                comments30d += discussion.Count(c => c.CreatedAt >= windowStart);
            }

            var ranked = perVoter.Values.OrderByDescending(count => count).ToList();
            var attributed = ranked.Sum();
            double? topTenShare = attributed > 0 ? (double)ranked.Take(10).Sum() / attributed : null;

            // ----------------------------------------------------- adoptions
            var adoptedSolutions = 0;
            var adoptions30d = 0;
            foreach (var solution in allSolutions)
            {
                var solutionUses = await uses.GetBySolution(solution.Id);
                if (solutionUses.Count > 0) adoptedSolutions++;
                adoptions30d += solutionUses.Count(use => use.StartedAt >= windowStart);
            }

            // -------------------------------------------------- participation
            var participation = 0;
            foreach (var status in Enum.GetValues<ContributionStatus>())
            {
                participation += (await contributions.GetByStatus(status))
                    .Count(c => c.CreatedAt >= windowStart);
            }

            /*
             * People, ranked by what they have done.
             *
             * From the audit records, because that is the one place every kind of
             * contribution is attributed in the same vocabulary. Only the actions that
             * are genuinely contribution count — a decision or a visibility change is
             * administration, and counting it would flatter whoever administers the hub
             * into looking like its most active participant.
             */
            var contributionOf = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["request.created"] = "ideas",
                ["solution.created"] = "ideas",
                ["vote.added"] = "votes",
                ["comment.added"] = "comments",
                ["solutionUse.started"] = "adoptions",
                ["solutionUse.completed"] = "adoptions",
            };

            var tallies = new Dictionary<string, int[]>(StringComparer.OrdinalIgnoreCase);
            foreach (var record in await auditLog.GetRecent(2000))
            {
                if (!contributionOf.TryGetValue(record.Action, out var bucket)) continue;
                if (!visibleSubjects.Contains(record.SubjectId)) continue;
                var actor = record.ActorId;
                if (string.IsNullOrWhiteSpace(actor)) continue;
                if (!tallies.TryGetValue(actor, out var counts)) tallies[actor] = counts = new int[4];
                counts[bucket switch
                {
                    "ideas" => 0,
                    "votes" => 1,
                    "comments" => 2,
                    _ => 3,
                }]++;
            }

            var contributors = tallies
                .Select(entry => new ContributorInsightResponse(
                    entry.Key,
                    // Already an identity a reader can be shown; the surface names it.
                    null,
                    entry.Value[0],
                    entry.Value[1],
                    entry.Value[2],
                    entry.Value[3],
                    entry.Value.Sum()))
                .OrderByDescending(entry => entry.Total)
                .Take(8)
                .ToList();

            var funnel = new List<FunnelStageResponse>
            {
                new("Submitted", allRequests.Count, "Every idea you can see"),
                new("Awaiting approval", awaiting.Count, "In AwaitingApproval"),
                new("Approved", approved, "Accepted"),
                new("Solution linked", linkedIdeas, "Has at least one linked solution"),
                new("Adopted", adoptedSolutions, "Solutions with at least one adoption"),
            };

            return Results.Ok(new InsightsResponse(
                now.ToString("O"),
                new IdeaFlowInsightsResponse(allRequests.Count, submitted30d, submittedPrior30d),
                new ApprovalInsightsResponse(
                    Percentile(durations, 0.5),
                    Percentile(durations, 0.9),
                    durations.Count,
                    "Submission to the recorded approval decision",
                    stale,
                    staleAfterDays),
                new VoterInsightsResponse(
                    perVoter.Count,
                    totalVotes,
                    // No user directory on this host. Null says so; a number would be
                    // an invention, and voter breadth without a denominator is a lie.
                    null,
                    null,
                    topTenShare),
                new EngagementInsightsResponse(
                    votes30d,
                    comments30d,
                    // Null, not zero: nothing in the UI creates a participation row,
                    // so zero would report an unbuilt feature as an unpopular one.
                    participation > 0 ? participation : null,
                    adoptions30d),
                new SolutionInsightsResponse(allSolutions.Count, adoptedSolutions),
                funnel,
                contributors));
        });

        // Uploads arrive as base64 JSON so they travel the same client bridge as
        // every other call; the response descriptor is read back from storage.
        api.MapPost("/attachments", async (
            UploadAttachmentRequest request,
            IAttachmentStore attachments) =>
        {
            if (string.IsNullOrWhiteSpace(request.FileName))
                return Results.BadRequest(new { error = "FileName is required." });
            if (string.IsNullOrWhiteSpace(request.ContentBase64))
                return Results.BadRequest(new { error = "ContentBase64 is required." });

            byte[] content;
            try
            {
                content = Convert.FromBase64String(request.ContentBase64);
            }
            catch (FormatException)
            {
                return Results.BadRequest(new { error = "ContentBase64 is not valid base64." });
            }

            if (content.Length == 0)
                return Results.BadRequest(new { error = "Attachment is empty." });
            if (content.Length > MaxAttachmentBytes)
                return Results.BadRequest(new { error = $"Attachment exceeds the {MaxAttachmentBytes / (1024 * 1024)} MB limit." });

            var stored = await attachments.Save(request.FileName, request.ContentType, content);
            return Results.Ok(ToAttachmentResponse(stored));
        });

        api.MapGet("/attachments/{id}", async (string id, IAttachmentStore attachments) =>
        {
            var download = await attachments.Open(id);
            if (download is null) return Results.NotFound();
            return Results.File(
                download.Content,
                download.Descriptor.ContentType,
                download.Descriptor.FileName);
        });

        api.MapPost("/participation", async (
            RequestParticipationRequest request,
            IIdentityProvider identity,
            IContributionRepository contributions,
            IRequestRepository requests,
            ISolutionRepository solutions,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            if (!TryGetTarget(request.ItemType, request.ItemId, out var target, out var error))
                return Results.BadRequest(new { error });
            if (string.IsNullOrWhiteSpace(request.Message))
                return Results.BadRequest(new { error = "Message is required." });
            var userId = await identity.GetCurrentUserId();
            var result = await new RequestParticipationHandler(contributions, requests, solutions, events, audit)
                .Handle(new RequestParticipationCommand(target, userId, request.Message));
            return Results.Created($"/api/participation/{result.Id}", ToParticipationResponse(result));
        });

        api.MapGet("/participation/mine", async (
            IIdentityProvider identity,
            IContributionRepository contributions) =>
        {
            var userId = await identity.GetCurrentUserId();
            var items = await contributions.GetByUser(userId);
            return Results.Ok(items.Select(ToParticipationResponse).ToList());
        });

        // Participation needs no approval: ideas and solutions are reviewed,
        // people offering to help are not. Joining takes effect immediately, and
        // withdrawing is the only state change left.
        api.MapPost("/participation/{id}/withdraw", async (
            string id,
            IIdentityProvider identity,
            IContributionRepository contributions,
            IEventPublisher events,
            IAuditRepository audit) =>
        {
            var userId = await identity.GetCurrentUserId();
            var result = await new WithdrawContributionHandler(contributions, events, audit)
                .Handle(new WithdrawContributionCommand(id, userId));
            return Results.Ok(ToParticipationResponse(result));
        });

        return endpoints;
    }

    /// <summary>
    /// Reading an idea is a visibility question, not an ownership one: the hub
    /// exists so people can find and build on each other's ideas
    /// (docs/design/capabilities/backlog/visibility.md). Approver-only comments
    /// stay gated separately by <see cref="CommentAudienceFilter"/>.
    /// </summary>
    private static async Task<bool> CanReadRequest(IIdentityProvider identity, Request request)
    {
        var role = await identity.GetCurrentUserRole();
        var userId = await identity.GetCurrentUserId();
        return ItemVisibilityRules.CanSee(
            request.Visibility, ApprovalStates.Of(request.Status), role, request.SubmittedBy == userId);
    }

    private static async Task<bool> CanSeeSolution(IIdentityProvider identity, Solution solution)
    {
        var role = await identity.GetCurrentUserRole();
        var userId = await identity.GetCurrentUserId();
        var isOwner = (solution.Owner ?? solution.SubmittedBy) == userId;
        return ItemVisibilityRules.CanSee(
            solution.Visibility, ApprovalStates.Of(solution.Status), role, isOwner);
    }

    private static bool IsApprover(Role role) => role is Role.Approver or Role.Administrator;

    /// <summary>
    /// 403 with a JSON body. Not <c>Results.Forbid()</c>: that defers to
    /// ASP.NET's authentication stack, which this service does not register —
    /// it authenticates through <see cref="Auth.WebSessionAuthMiddleware"/> —
    /// so Forbid() throws and the caller sees a 500 instead of a refusal.
    /// </summary>
    private static IResult Forbidden() =>
        Results.Json(new { error = "You do not have access to this." }, statusCode: StatusCodes.Status403Forbidden);

    private static async Task<IReadOnlyList<Request>> FilterVisibleRequests(
        IIdentityProvider identity,
        IEnumerable<Request> items)
    {
        var role = await identity.GetCurrentUserRole();
        var userId = await identity.GetCurrentUserId();
        return items
            .Where(item => ItemVisibilityRules.CanSee(
                item.Visibility, ApprovalStates.Of(item.Status), role, item.SubmittedBy == userId))
            .ToList();
    }

    private static async Task<IReadOnlyList<Solution>> FilterVisibleSolutions(
        IIdentityProvider identity,
        IEnumerable<Solution> items)
    {
        var role = await identity.GetCurrentUserRole();
        var userId = await identity.GetCurrentUserId();
        return items
            .Where(item => ItemVisibilityRules.CanSee(
                item.Visibility,
                ApprovalStates.Of(item.Status),
                role,
                (item.Owner ?? item.SubmittedBy) == userId))
            .ToList();
    }

    /// <summary>Ideas that have not had a decision yet, oldest first.</summary>
    private static async Task<IReadOnlyList<Request>> PendingRequests(IRequestRepository requests) =>
        (await AllRequests(requests))
            .Where(item => ApprovalStates.Of(item.Status) == ApprovalState.Pending)
            .OrderBy(item => item.CreatedAt)
            .ToList();

    /// <summary>Approved links only, unless the caller reviews them.</summary>
    private static async Task<IReadOnlyList<RequestSolution>> VisibleLinks(
        IIdentityProvider identity,
        IEnumerable<RequestSolution> links)
    {
        var role = await identity.GetCurrentUserRole();
        return ApprovalStates.CanReview(role)
            ? links.ToList()
            : links.Where(link => link.Approval == ApprovalState.Approved).ToList();
    }

    private static async Task<IResult> ReviewSolution(
        string id,
        string rationale,
        bool accept,
        IIdentityProvider identity,
        ISolutionRepository solutions,
        IEventPublisher events,
        IAuditRepository audit)
    {
        var role = await identity.GetCurrentUserRole();
        if (!ApprovalStates.CanReview(role)) return Forbidden();
        var reviewerId = await identity.GetCurrentUserId();
        try
        {
            var result = await new ReviewSolutionHandler(solutions, events, audit)
                .Handle(new ReviewSolutionCommand(id, reviewerId, role, accept, rationale));
            return Results.Ok(ToSolutionResponse(result));
        }
        catch (InvalidOperationException reason)
        {
            return Results.BadRequest(new { error = reason.Message });
        }
    }

    private static async Task<IResult> ReviewLink(
        string requestId,
        string solutionId,
        string rationale,
        bool accept,
        IIdentityProvider identity,
        IRequestSolutionRepository relationships,
        IAuditRepository audit)
    {
        var role = await identity.GetCurrentUserRole();
        if (!ApprovalStates.CanReview(role)) return Forbidden();
        var reviewerId = await identity.GetCurrentUserId();
        try
        {
            await new ReviewLinkHandler(relationships, audit)
                .Handle(new ReviewLinkCommand(requestId, solutionId, reviewerId, role, accept, rationale));
            return Results.NoContent();
        }
        catch (InvalidOperationException reason)
        {
            return Results.BadRequest(new { error = reason.Message });
        }
    }

    /// <summary>Every request, across all statuses — the repository has no "all" port.</summary>
    /// <summary>
    /// Nearest-rank percentile over an ascending sample, rounded to a tenth of a day.
    /// Null for an empty sample — a median of nothing is not zero.
    /// </summary>
    private static double? Percentile(IReadOnlyList<double> sorted, double fraction)
    {
        if (sorted.Count == 0) return null;
        var rank = (int)Math.Ceiling(fraction * sorted.Count);
        var index = Math.Clamp(rank - 1, 0, sorted.Count - 1);
        return Math.Round(sorted[index], 1);
    }

    private static async Task<IReadOnlyList<Request>> AllRequests(IRequestRepository requests)
    {
        var all = new List<Request>();
        foreach (var status in Enum.GetValues<RequestStatus>())
        {
            all.AddRange(await requests.GetByStatus(status));
        }
        return all;
    }

    /// <summary>Ids of every item the caller may see, for filtering the audit feed.</summary>
    private static async Task<HashSet<string>> VisibleSubjectIds(
        IIdentityProvider identity,
        IRequestRepository requests,
        ISolutionRepository solutions)
    {
        var visibleRequests = await FilterVisibleRequests(identity, await AllRequests(requests));
        var visibleSolutions = await FilterVisibleSolutions(identity, await solutions.Search(string.Empty, 0, 500));
        return visibleRequests.Select(item => item.Id)
            .Concat(visibleSolutions.Select(item => item.Id))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static async Task<IResult> ChangeVisibility(
        HubItemType itemType,
        string id,
        SetVisibilityRequest body,
        IIdentityProvider identity,
        IRequestRepository requests,
        ISolutionRepository solutions,
        IAuditRepository audit)
    {
        var role = await identity.GetCurrentUserRole();
        if (!ItemVisibilityRules.CanChange(role)) return Forbidden();
        if (!TryGetVisibility(body.Visibility, out var visibility, out var error))
            return Results.BadRequest(new { error });

        var actorId = await identity.GetCurrentUserId();
        try
        {
            var applied = await new SetItemVisibilityHandler(requests, solutions, audit)
                .Handle(new SetItemVisibilityCommand(
                    new HubItemReference(itemType, id), visibility, actorId, role));
            return Results.Ok(new { itemType = itemType.ToString(), itemId = id, visibility = applied.ToString() });
        }
        catch (InvalidOperationException reason)
        {
            return Results.NotFound(new { error = reason.Message });
        }
    }

    private static bool TryGetVisibility(string? value, out ItemVisibility visibility, out string error)
    {
        if (!Enum.TryParse(value, true, out visibility))
        {
            error = "Visibility must be one of Everyone, Approvers, Hidden.";
            return false;
        }
        error = string.Empty;
        return true;
    }

    private static IEnumerable<AuditRecord> FilterAudit(IEnumerable<AuditRecord> records, Role role) =>
        IsApprover(role)
            ? records
            : records.Where(record => record.Audience != AuditAudience.ApproversOnly);

    private static bool TryGetTarget(string? itemType, string? itemId, out HubItemReference target, out string error)
    {
        if (string.IsNullOrWhiteSpace(itemId))
        {
            target = null!;
            error = "ItemId is required.";
            return false;
        }
        if (!Enum.TryParse<HubItemType>(itemType, true, out var type))
        {
            target = null!;
            error = "ItemType must be 'Request' or 'Solution'.";
            return false;
        }
        target = new HubItemReference(type, itemId);
        error = string.Empty;
        return true;
    }

    /// <summary>
    /// A caller that only knows "this solution belongs on this idea" gets
    /// <see cref="RequestSolutionRelationship.Proposed"/>; an explicit value that
    /// is not a known relationship is still an error.
    /// </summary>
    private static bool TryGetRelationship(string? value, out RequestSolutionRelationship relationship, out string error)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            relationship = RequestSolutionRelationship.Proposed;
            error = string.Empty;
            return true;
        }
        if (!Enum.TryParse(value, true, out relationship))
        {
            error = "Relationship must be one of Proposed, Relevant, Existing.";
            return false;
        }
        error = string.Empty;
        return true;
    }

    /// <summary>
    /// Turns client-supplied attachment ids into descriptors read back from the
    /// store, so a comment can never claim a name, type, or size of its own.
    /// </summary>
    private static async Task<(IReadOnlyList<CommentAttachment> Attachments, string? Error)> ResolveAttachments(
        IAttachmentStore store,
        IReadOnlyList<string>? ids)
    {
        if (ids is null || ids.Count == 0)
            return (Array.Empty<CommentAttachment>(), null);

        var resolved = new List<CommentAttachment>(ids.Count);
        foreach (var id in ids.Distinct(StringComparer.Ordinal))
        {
            var descriptor = await store.Describe(id);
            if (descriptor is null)
                return (Array.Empty<CommentAttachment>(), $"Attachment '{id}' was not found.");
            resolved.Add(descriptor);
        }
        return (resolved, null);
    }

    private static bool TryGetSolutionUseStatusNullable(string? status, out SolutionUseStatus? value, out string error)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            value = null;
            error = string.Empty;
            return true;
        }
        if (!Enum.TryParse<SolutionUseStatus>(status, true, out var parsed))
        {
            value = null;
            error = "Status must be one of Exploring, Implementing, Using.";
            return false;
        }
        value = parsed;
        error = string.Empty;
        return true;
    }

    private static SolutionUseStatus ParseSolutionUseStatus(string? status)
        => Enum.TryParse<SolutionUseStatus>(status, true, out var parsed) ? parsed : SolutionUseStatus.Exploring;

    private static RequestType ParseRequestType(string? value)
        => Enum.TryParse<RequestType>(value, true, out var parsed) ? parsed : RequestType.Backlog;

    private static Contracts.RequestResponse ToRequestResponse(Request request) =>
        new(
            request.Id,
            request.Type.ToString(),
            request.Status.ToString(),
            request.Title,
            request.Description,
            request.SubmittedBy.Value,
            request.CanonicalSolutionId,
            request.CreatedAt.ToString("O"),
            request.UpdatedAt.ToString("O"),
            request.Visibility.ToString(),
            request.Tags);

    private static Contracts.SolutionResponse ToSolutionResponse(Solution solution) =>
        new(
            solution.Id,
            solution.Title,
            solution.Description,
            solution.Type.ToString(),
            solution.Status.ToString(),
            solution.RepositoryReference.Owner,
            solution.RepositoryReference.Name,
            solution.RepositoryReference.Url,
            solution.DemoUrl,
            solution.Owner?.Value,
            solution.UseCount,
            solution.AdoptedByProjects,
            solution.CreatedAt.ToString("O"),
            solution.UpdatedAt.ToString("O"),
            solution.PublishedAt?.ToString("O"),
            solution.Visibility.ToString(),
            solution.Tags);

    private static SearchResponseItem ToSearchItem(Solution solution) =>
        new(
            "Solution",
            solution.Id,
            solution.Title,
            solution.Description,
            solution.Status.ToString(),
            null,
            solution.RepositoryReference.Url,
            null,
            solution.CreatedAt.ToString("O"),
            solution.UpdatedAt.ToString("O"),
            solution.Type.ToString(),
            (solution.Owner ?? solution.SubmittedBy).Value,
            solution.Visibility.ToString(),
            solution.Tags);

    private static SearchResponseItem ToSearchItem(Request request) =>
        new(
            "Request",
            request.Id,
            request.Title,
            request.Description,
            request.Status.ToString(),
            request.CanonicalSolutionId,
            null,
            null,
            request.CreatedAt.ToString("O"),
            request.UpdatedAt.ToString("O"),
            request.Type.ToString(),
            request.SubmittedBy.Value,
            request.Visibility.ToString(),
            request.Tags);

    private static Contracts.ActivityResponseItem ToActivityItem(AuditRecord record) =>
        new(
            record.Id,
            record.Action,
            record.ResourceType,
            record.ResourceId,
            record.SubjectId,
            record.ActorType.ToString(),
            record.ActorId,
            record.Summary,
            record.Audience.ToString(),
            record.OccurredAt.ToString("O"));

    private static Contracts.AttachmentResponse ToAttachmentResponse(CommentAttachment attachment) =>
        new(attachment.Id, attachment.FileName, attachment.ContentType, attachment.Length);

    private static Contracts.SolutionUseResponse ToSolutionUseResponse(SolutionUse use) =>
        new(
            use.Id,
            use.SolutionId,
            use.StartedBy.Value,
            use.ProjectName,
            use.Team,
            use.Status.ToString(),
            use.StartedAt.ToString("O"),
            use.UpdatedAt.ToString("O"),
            use.CompletedAt?.ToString("O"));

    private static Contracts.ParticipationResponse ToParticipationResponse(Contribution contribution) =>
        new(
            contribution.Id,
            contribution.Target.ItemType.ToString(),
            contribution.Target.ItemId,
            contribution.RequestedBy.Value,
            contribution.Message,
            contribution.Status.ToString(),
            contribution.DecidedBy?.Value,
            contribution.Rationale,
            contribution.CreatedAt.ToString("O"),
            contribution.UpdatedAt.ToString("O"),
            contribution.DecidedAt?.ToString("O"));

    private static Contracts.CommentResponse ToCommentResponse(Comment comment) =>
        new(
            comment.Id,
            comment.SubjectId,
            comment.SubjectType.ToString(),
            comment.AuthorId.Value,
            comment.Audience.ToString(),
            comment.Body,
            comment.Attachments.Select(ToAttachmentResponse).ToList(),
            comment.CreatedAt.ToString("O"));
}
