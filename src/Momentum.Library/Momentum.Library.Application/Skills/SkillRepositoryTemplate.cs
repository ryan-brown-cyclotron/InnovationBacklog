namespace Momentum.Library.Application.Skills;

/// <summary>
/// The non-manifest files a fresh skills repository gets.
/// </summary>
/// <remarks>
/// Neither is load-bearing for intake — a repository with only
/// <c>.claude-plugin/marketplace.json</c> works. They are here because both answer a question
/// the repository will otherwise get asked: what is this, and why did my file change.
/// </remarks>
public static class SkillRepositoryTemplate
{
    public const string ReadmePath = "README.md";
    public const string GitAttributesPath = ".gitattributes";

    public static IReadOnlyDictionary<string, string> SupportingFiles { get; } =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [ReadmePath] = Readme,
            [GitAttributesPath] = GitAttributes,
        };

    private const string Readme = """
        # Skills

        Skills adopted from the Innovation Backlog. Written by the skill intake endpoints,
        not by hand.

        ## Layout

        ```
        plugins/{segment}/skills/{solutionId}__{name}/SKILL.md
        ```

        `segment` is the plugin a reviewer filed the skill under. `solutionId` is the GUID of
        the catalogue entry it was adopted from, and it is the **entire** link between this
        repository and the backlog: no sidecar file, no lookup table. A folder name answers
        "which solution is this?" and a path answers "where is this solution's skill?".

        `name` is the skill's published name, carried alongside the id so the repository stays
        browsable. Skills are discovered by the `name` in their SKILL.md frontmatter, not by
        their directory, so the two are free to disagree — but a rename at approval moves the
        folder as well, in the same commit, or the marketplace would publish one solution twice.

        To find a skill by name, grep the frontmatter:

        ```bash
        grep -r "^name: pdf-tables" plugins/*/skills/*/SKILL.md
        ```

        ## Editing by hand

        Prefer not to. Intake validates a package before writing it — frontmatter present,
        name usable as a folder, description non-empty, no paths colliding by case — and a
        hand-edited skill gets none of that until someone re-uploads it.
        """;

    /*
        eol=lf because intake commits the bytes it extracted from the upload, which came off
        whatever machine built the archive. Without this, a Windows contributor's skill lands
        with CRLF and every subsequent commit that touches it shows the whole file as changed.
    */
    private const string GitAttributes = """
        * text=auto eol=lf
        *.png binary
        *.jpg binary
        *.gif binary
        *.ico binary
        *.pdf binary
        """;
}
