using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Requests;
using Momentum.Library.Domain.Tagging;

namespace Momentum.Library.Application.Search;

public sealed class SearchRequestsHandler
{
    private readonly IRequestRepository _requests;

    public SearchRequestsHandler(IRequestRepository requests)
    {
        _requests = requests;
    }

    public async Task<SearchResult<Request>> Handle(SearchRequestsQuery query)
    {
        var lowerQuery = query.Query?.Trim().ToLowerInvariant() ?? string.Empty;
        var byStatus = new Dictionary<RequestStatus, List<Request>>();
        foreach (var status in Enum.GetValues<RequestStatus>())
        {
            byStatus[status] = new List<Request>();
        }

        await Task.WhenAll(Enum.GetValues<RequestStatus>().Select(async status =>
        {
            var items = await _requests.GetByStatus(status);
            byStatus[status] = items.ToList();
        }));

        var matched = byStatus.SelectMany(kv => kv.Value)
            .Where(r => string.IsNullOrEmpty(lowerQuery)
                || r.Title.Contains(lowerQuery, StringComparison.OrdinalIgnoreCase)
                || r.Description.Contains(lowerQuery, StringComparison.OrdinalIgnoreCase)
                || TagList.Matches(r.Tags, lowerQuery))
            .ToList();

        var skip = Math.Max(0, query.Skip);
        var take = Math.Max(1, query.Take);
        var page = matched.Skip(skip).Take(take).ToList();
        return new SearchResult<Request>(page, matched.Count, skip, take);
    }
}
