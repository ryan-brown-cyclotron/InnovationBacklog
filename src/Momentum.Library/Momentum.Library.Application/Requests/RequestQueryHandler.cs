using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Identity;
using Momentum.Library.Domain.Requests;

namespace Momentum.Library.Application.Requests;

public sealed class RequestQueryHandler
{
    private readonly IRequestRepository _requests;

    public RequestQueryHandler(IRequestRepository requests)
    {
        _requests = requests;
    }

    public Task<Request?> GetById(string id) => _requests.GetById(id);
    public Task<IReadOnlyList<Request>> GetBySubmitter(UserId submitterId) => _requests.GetBySubmitter(submitterId);
}
