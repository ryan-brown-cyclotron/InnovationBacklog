using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Solutions;

namespace Momentum.Library.Application.Search;

public sealed class SearchSolutionsHandler
{
    private readonly ISolutionRepository _solutions;

    public SearchSolutionsHandler(ISolutionRepository solutions)
    {
        _solutions = solutions;
    }

    public async Task<SearchResult<Solution>> Handle(SearchSolutionsQuery query)
    {
        var items = await _solutions.Search(query.Query, query.Skip, query.Take);
        return new SearchResult<Solution>(items, items.Count, query.Skip, query.Take);
    }
}
