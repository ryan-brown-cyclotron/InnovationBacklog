namespace Momentum.Library.Application.Ports;

public sealed record RepositoryFile(string Path, string Content);

public sealed record RepositoryContent(IReadOnlyList<RepositoryFile> Files, IReadOnlyList<string> ReadmePaths)
{
    public RepositoryContent() : this(Array.Empty<RepositoryFile>(), Array.Empty<string>()) { }
}
