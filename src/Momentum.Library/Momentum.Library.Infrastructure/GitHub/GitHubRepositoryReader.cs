using Momentum.Library.Application.Ports;
using Momentum.Library.Domain.Solutions;
using Octokit;
using RepoReference = Momentum.Library.Domain.Solutions.RepositoryReference;
using RepoContent = Momentum.Library.Application.Ports.RepositoryContent;

namespace Momentum.Library.Infrastructure.GitHub;

public sealed class GitHubRepositoryReader : IRepositoryReader
{
    private readonly GitHubOptions _options;
    private readonly GitHubClient _client;

    public GitHubRepositoryReader(GitHubOptions options)
    {
        _options = options;
        _client = new GitHubClient(new ProductHeaderValue("Momentum"))
        {
            Credentials = new Credentials(options.Credentials.ReadToken)
        };
    }

    public async Task<RepoContent> ReadRepository(RepoReference reference)
    {
        var files = new List<RepositoryFile>();
        var readmePaths = new List<string>();
        await ReadDirectoryAsync(reference.Owner, reference.Name, "", files, readmePaths);
        return new RepoContent(files, readmePaths);
    }

    private async Task ReadDirectoryAsync(string owner, string repo, string path, List<RepositoryFile> files, List<string> readmePaths)
    {
        IReadOnlyList<Octokit.RepositoryContent> contents;
        try
        {
            contents = string.IsNullOrEmpty(path)
                ? await _client.Repository.Content.GetAllContents(owner, repo)
                : await _client.Repository.Content.GetAllContents(owner, repo, path);
        }
        catch (ApiException)
        {
            return;
        }

        foreach (var content in contents)
        {
            if (content.Type == ContentType.Dir)
            {
                await ReadDirectoryAsync(owner, repo, content.Path, files, readmePaths);
            }
            else if (content.Type == ContentType.File)
            {
                string decoded;
                try
                {
                    var fileContents = await _client.Repository.Content.GetAllContents(owner, repo, content.Path);
                    var fileContent = fileContents.FirstOrDefault();
                    decoded = fileContent?.Content is not null
                        ? System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(fileContent.Content))
                        : string.Empty;
                }
                catch (ApiException)
                {
                    decoded = string.Empty;
                }

                files.Add(new RepositoryFile(content.Path, decoded));
                if (content.Name.Contains("README", StringComparison.OrdinalIgnoreCase))
                    readmePaths.Add(content.Path);
            }
        }
    }
}
