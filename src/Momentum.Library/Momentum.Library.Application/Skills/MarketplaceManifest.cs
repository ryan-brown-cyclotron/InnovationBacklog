using System.Text.Json;
using System.Text.Json.Nodes;
using Momentum.Library.Domain.Skills;

namespace Momentum.Library.Application.Skills;

/// <summary>
/// Reads and edits <c>.claude-plugin/marketplace.json</c>.
/// </summary>
/// <remarks>
/// Edited as a <see cref="JsonNode"/> rather than deserialised into a model, because the
/// file is owned by the plugin format and not by us. A round trip through a typed model
/// would silently drop any property this code does not know about.
/// </remarks>
public static class MarketplaceManifest
{
    public const string Path = ".claude-plugin/marketplace.json";

    private static readonly JsonSerializerOptions WriteOptions = new() { WriteIndented = true };

    /// <summary>
    /// A manifest for a repository that has none yet.
    /// </summary>
    /// <remarks>
    /// Built and serialized through the same code path an intake uses, so the first adoption
    /// produces a one-line diff rather than a whole-file reformat. Anything that seeds this
    /// file by another route — the provisioning PowerShell script, a hand edit — will differ
    /// in whitespace and the first commit after it will rewrite the lot.
    /// </remarks>
    /// <param name="segments">
    /// Convenience only. Intake registers a segment on first use, so seeding none is valid.
    /// </param>
    public static JsonObject Create(
        string name, string owner, string description, IEnumerable<string> segments)
    {
        var manifest = new JsonObject
        {
            ["name"] = name,
            ["owner"] = new JsonObject { ["name"] = owner },
            ["description"] = description,
            ["plugins"] = new JsonArray(),
        };

        foreach (var segment in segments)
        {
            UpsertPlugin(manifest, segment, $"./plugins/{segment}", version: null);
        }

        return manifest;
    }

    public static JsonObject Parse(string content)
    {
        JsonNode? node;
        try
        {
            node = JsonNode.Parse(content);
        }
        catch (JsonException ex)
        {
            throw new SkillIntakeException($"{Path} is not valid JSON.", ex);
        }

        return node as JsonObject
            ?? throw new SkillIntakeException($"{Path} is not a JSON object.");
    }

    /// <summary>
    /// Adds the plugin entry if the segment is new, or updates its version if it is not.
    /// Returns whether the segment was newly registered.
    /// </summary>
    public static bool UpsertPlugin(JsonObject manifest, string pluginName, string source, string? version)
    {
        if (manifest["plugins"] is not JsonArray plugins)
        {
            // Absent or wrong-typed: create it rather than throwing. A manifest with no
            // plugins yet is a legitimate starting state.
            plugins = [];
            manifest["plugins"] = plugins;
        }

        var existing = plugins
            .OfType<JsonObject>()
            .FirstOrDefault(plugin =>
                plugin["name"]?.GetValue<string>() == pluginName);

        if (existing is not null)
        {
            if (!string.IsNullOrWhiteSpace(version))
            {
                existing["version"] = version;
            }

            return false;
        }

        plugins.Add(new JsonObject
        {
            ["name"] = pluginName,
            ["source"] = source,
            ["version"] = string.IsNullOrWhiteSpace(version) ? "1.0.0" : version,
        });

        return true;
    }

    public static string Serialize(JsonObject manifest) => manifest.ToJsonString(WriteOptions);
}
