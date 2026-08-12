using System.IO.Compression;
using System.Text;
using Momentum.Library.Domain.Skills;

namespace Momentum.Library.Application.Skills;

/// <summary>
/// Turns an upload into a flat set of files to commit.
/// </summary>
/// <remarks>
/// Pure translation, no I/O, so the awkward parts — archive shape, path safety, text
/// versus binary — are testable without a repository.
/// </remarks>
public static class SkillPackageExtractor
{
    /// <summary>
    /// Ceiling on a single extracted file. Guards against a zip bomb and against
    /// pushing something Azure DevOps will reject anyway.
    /// </summary>
    public const int MaxFileBytes = 5 * 1024 * 1024;

    /// <summary>Ceiling on the whole package, uncompressed.</summary>
    public const int MaxPackageBytes = 20 * 1024 * 1024;

    public const int MaxFileCount = 200;

    public static SkillPackage Extract(byte[] upload, string uploadFileName, string skillName)
    {
        ArgumentNullException.ThrowIfNull(upload);

        if (upload.Length == 0)
        {
            throw new SkillIntakeException("The uploaded file is empty.");
        }

        var extension = Path.GetExtension(uploadFileName).ToLowerInvariant();

        var files = extension switch
        {
            ".md" => [new SkillFile("SKILL.md", upload, IsText: true)],
            ".zip" or ".skill" => ExtractArchive(upload),
            _ => throw new SkillIntakeException(
                $"Unsupported upload type '{extension}'. Expected .md, .zip, or .skill."),
        };

        if (files.Count == 0)
        {
            throw new SkillIntakeException("The archive contains no files.");
        }

        var total = files.Sum(file => file.Size);
        if (total > MaxPackageBytes)
        {
            throw new SkillIntakeException(
                $"The package expands to {total:N0} bytes, over the {MaxPackageBytes:N0} byte limit.");
        }

        return new SkillPackage(skillName, files);
    }

    private static List<SkillFile> ExtractArchive(byte[] upload)
    {
        using var stream = new MemoryStream(upload);

        ZipArchive archive;
        try
        {
            archive = new ZipArchive(stream, ZipArchiveMode.Read);
        }
        catch (InvalidDataException ex)
        {
            throw new SkillIntakeException("The upload is not a readable zip archive.", ex);
        }

        using (archive)
        {
            // Entries whose Name is empty are directory markers and carry no content.
            var entries = archive.Entries.Where(entry => !string.IsNullOrEmpty(entry.Name)).ToList();

            if (entries.Count > MaxFileCount)
            {
                throw new SkillIntakeException(
                    $"The archive holds {entries.Count} files, over the {MaxFileCount} file limit.");
            }

            /*
                Sanitize BEFORE stripping the common root, never after. A single entry
                named "../escape.md" makes "../" look like a common root folder, and
                stripping it first leaves a harmless-looking "escape.md" that has already
                escaped. Validating the raw entry name closes that door.
            */
            var safePaths = entries
                .Select(entry => SanitizeRelativePath(entry.FullName, entry.FullName))
                .ToList();

            var prefix = FindCommonRootFolder(safePaths);
            var files = new List<SkillFile>(entries.Count);

            for (var index = 0; index < entries.Count; index++)
            {
                var entry = entries[index];

                if (entry.Length > MaxFileBytes)
                {
                    throw new SkillIntakeException(
                        $"'{entry.FullName}' is {entry.Length:N0} bytes, over the {MaxFileBytes:N0} byte limit.");
                }

                var relativePath = safePaths[index].StartsWith(prefix, StringComparison.Ordinal)
                    ? safePaths[index][prefix.Length..]
                    : safePaths[index];

                if (relativePath.Length == 0)
                {
                    throw new SkillIntakeException(
                        $"Archive entry '{entry.FullName}' has no path once its root folder is removed.");
                }

                using var entryStream = entry.Open();
                using var buffer = new MemoryStream();
                entryStream.CopyTo(buffer);
                var content = buffer.ToArray();

                files.Add(new SkillFile(relativePath, content, LooksLikeText(content)));
            }

            return files;
        }
    }

    /// <summary>
    /// Archives arrive both ways: files at the root, or everything nested one level
    /// under a single folder named for the skill. Strip the latter so the destination
    /// path does not end up doubled.
    /// </summary>
    private static string FindCommonRootFolder(List<string> paths)
    {
        if (paths.Count == 0)
        {
            return string.Empty;
        }

        var separator = paths[0].IndexOf('/');
        if (separator <= 0)
        {
            return string.Empty;
        }

        var candidate = paths[0][..(separator + 1)];

        // Only a folder shared by *every* entry may be stripped. Two top-level folders
        // would otherwise collide onto the same relative path.
        return paths.All(path => path.StartsWith(candidate, StringComparison.Ordinal))
            ? candidate
            : string.Empty;
    }

    /// <summary>
    /// Rejects anything that would escape the destination folder.
    /// </summary>
    /// <remarks>
    /// An archive entry name is attacker-controlled. Left unchecked, <c>../</c> segments
    /// or a rooted path let an upload write outside its own skill folder — over another
    /// team's skill, or over the marketplace manifest itself.
    /// </remarks>
    private static string SanitizeRelativePath(string relativePath, string originalEntryName)
    {
        var normalized = relativePath.Replace('\\', '/').Trim();

        if (string.IsNullOrEmpty(normalized))
        {
            throw new SkillIntakeException($"Archive entry '{originalEntryName}' has no usable path.");
        }

        if (normalized.StartsWith('/') || Path.IsPathRooted(normalized) || normalized.Contains(':'))
        {
            throw new SkillIntakeException($"Archive entry '{originalEntryName}' is an absolute path.");
        }

        var segments = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Any(segment => segment is "." or ".."))
        {
            throw new SkillIntakeException(
                $"Archive entry '{originalEntryName}' escapes the skill folder.");
        }

        return string.Join('/', segments);
    }

    /// <summary>
    /// Decides how a file is committed. Azure DevOps takes either <c>rawtext</c> or
    /// <c>base64encoded</c> content, and sending a PNG as rawtext corrupts it silently —
    /// the push succeeds and the file is ruined.
    /// </summary>
    private static bool LooksLikeText(byte[] content)
    {
        if (content.Length == 0)
        {
            return true;
        }

        // A NUL byte in the first few KB is the classic, and cheap, binary tell.
        var window = Math.Min(content.Length, 8000);
        for (var i = 0; i < window; i++)
        {
            if (content[i] == 0)
            {
                return false;
            }
        }

        // Reject anything that is not valid UTF-8; committing it as text would mangle it.
        try
        {
            new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true)
                .GetString(content);
            return true;
        }
        catch (DecoderFallbackException)
        {
            return false;
        }
    }
}
