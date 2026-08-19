using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using Momentum.Mcp.Auth;
using Momentum.Mcp.Backends;

namespace Momentum.Mcp.Backlog;

/// <summary>
/// Engagement for one item: who wanted it, who is using it, and how the two compare.
/// </summary>
/// <remarks>
/// Read from the rows that record the engagement — <c>cycai_vote</c>, <c>cycai_adoption</c>,
/// <c>cycai_participation</c> — rather than from the <c>cycai_momentum</c> rollup table.
/// <para>
/// The rollup is the obvious read and would be one row instead of four queries, but nothing
/// writes to it: there is no plugin, flow or worker behind either host, and the code app's
/// adapter was changed away from it for exactly this reason after every count it produced
/// came back zero (see <c>provider/dataverse/rollups.ts</c>). A cache nobody fills is worse
/// than no cache. It is still read here for one number — <see cref="Engagement.DemandRank"/>
/// — because a rank across the whole catalogue genuinely is not a live query per item:
/// FetchXML aggregates cannot order by an aggregate value. When the row is absent the rank
/// is reported as null with the reason attached, rather than as a zero that reads as fact.
/// </para>
/// <para>
/// Bounded to a single item on purpose. This is what makes <c>get</c> the place the two
/// stores meet: a few small filtered reads for one item are affordable — one request, since
/// they travel as a <c>$batch</c> — and the same join across a fifty-row list is not, which
/// is why <c>search</c> and <c>list</c> do not pay for it.
/// </para>
/// </remarks>
public sealed class EngagementReader(
    [FromKeyedServices(DownstreamResource.Dataverse)] DownstreamHttpClient dataverse)
{
    private const int RecentWindowDays = 30;

    public async Task<BackendResult<Engagement>> ReadAsync(
        Facet facet,
        string itemId,
        CallerContext caller,
        CancellationToken cancellationToken)
    {
        var targetKey = facet.TargetKey(itemId);
        var keyFilter = $"cycai_targetkey eq '{OData.Literal(targetKey)}'";

        // Adoption is keyed by the numeric solution id rather than the target key, and only
        // a solution can be adopted — an idea has nothing to adopt yet.
        long? solutionId = facet == Facet.Solution &&
            long.TryParse(itemId, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : null;

        /*
            One request, not four.

            These were four parallel GETs, which is four calls against the Dataverse
            budget for one `get`. Batching them is available here and is NOT available to
            the code app — the generated Power Platform services build one $batch per
            operation and expose no seam to share one — so it is worth taking where it can
            be taken.

            Parallel was never the point: the four already overlapped in time. The point
            is the call count, and the per-read failure reporting below is unchanged
            because each part carries its own status.
        */
        List<string> reads =
        [
            $"cycai_votes?$select=createdon&{OData.Filter(keyFilter)}&$count=true",
            $"cycai_participations?$select=cycai_participationstatus&{OData.Filter(keyFilter)}&$count=true",
            $"cycai_momentums?$select=cycai_demandrank,cycai_momentumscore,cycai_calculatedon&{OData.Filter(keyFilter)}&$top=1",
        ];

        if (solutionId is not null)
        {
            /*
                `cycai_adoptionstatus` is in the projection so withdrawn rows can be
                excluded, and `$count` is deliberately NOT requested for this read: the
                server would count every row including the withdrawn ones, and the code
                below cannot correct a number it did not compute. The other three reads
                keep `$count=true` because nothing filters them after the fact.
            */
            reads.Add(
                $"cycai_adoptions?$select=cycai_team,cycai_projectname,cycai_completedon,cycai_adoptionstatus" +
                $"&{OData.Filter($"cycai_solutionid eq {solutionId}")}");
        }

        var parts = await dataverse.BatchGetAsync(reads, caller, cancellationToken);

        var votes = parts[0].As<ODataPage<VoteRow>>();
        var participation = parts[1].As<ODataPage<ParticipationRow>>();
        var rollup = parts[2].As<ODataPage<MomentumRow>>();
        var adoptions = solutionId is null ? null : parts[3].As<ODataPage<AdoptionRow>>();

        /*
            Votes decide the outcome. They are the one engagement signal both facets always
            have, so a failure there means the caller genuinely cannot read engagement —
            whereas an unreadable rollup or an absent adoption table is a missing number.
        */
        if (!votes.Ok)
        {
            return BackendResult<Engagement>.Failed(votes.Failure!);
        }

        var voteRows = votes.Value!.Value ?? [];
        var voteCount = votes.Value.Count ?? voteRows.Count;
        var cutoff = DateTimeOffset.UtcNow.AddDays(-RecentWindowDays);

        var recent = voteRows.Count(row =>
            DateTimeOffset.TryParse(row.CreatedOn, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal, out var at) && at >= cutoff);

        var momentum = (rollup.Ok ? rollup.Value!.Value : null)?.FirstOrDefault();

        return BackendResult<Engagement>.Success(new Engagement(
            Votes: voteCount,
            VotesLast30Days: recent,
            Participation: Tally(participation),
            Adoption: Adoptions(adoptions),
            DemandRank: momentum?.DemandRank,
            MomentumScore: momentum?.MomentumScore,
            RollupCalculatedOn: momentum?.CalculatedOn,
            Notes: [.. Notes(participation, adoptions, momentum, voteRows.Count, voteCount)]));
    }

    /// <summary>
    /// Participation by stage. Null rather than an all-zero tally when the query failed,
    /// because "nobody offered to help" and "you cannot read who offered" are different
    /// answers and only one of them is about the item.
    /// </summary>
    private static ParticipationTally? Tally(BackendResult<ODataPage<ParticipationRow>> result)
    {
        if (!result.Ok)
        {
            return null;
        }

        var rows = result.Value!.Value ?? [];

        return new ParticipationTally(
            Proposed: rows.Count(row => row.Status == ParticipationRow.ProposedValue),
            Accepted: rows.Count(row => row.Status == ParticipationRow.AcceptedValue),
            Rejected: rows.Count(row => row.Status == ParticipationRow.RejectedValue),
            Withdrawn: rows.Count(row => row.Status == ParticipationRow.WithdrawnValue));
    }

    /// <summary>
    /// Adoption, counted the way the .NET summary endpoint counts it, so the two hosts
    /// cannot mean different things by the same number:
    /// <list type="bullet">
    ///   <item><c>Teams</c> counts DISTINCT team-or-project, case-insensitively. Four
    ///   adoptions across three teams is three, and an adoption with no team still counts
    ///   as one team via its project.</item>
    ///   <item>Active versus completed is decided by the COMPLETION TIMESTAMP, not by the
    ///   status choice. Completing an adoption happens to set status <c>Using</c> as well,
    ///   but the status is a workflow stage and the timestamp is the fact.</item>
    ///   <item>Withdrawn rows are the one case the timestamp cannot decide, and they count
    ///   in NOTHING — not the total, not the teams, not the active/completed split. A
    ///   withdrawal says the adoption is not real, and a withdrawn row never stamps a
    ///   completion timestamp, so counting it would file it as active for ever.</item>
    /// </list>
    /// </summary>
    private static AdoptionTally? Adoptions(BackendResult<ODataPage<AdoptionRow>>? result)
    {
        if (result is null || !result.Ok)
        {
            return null;
        }

        // Filtered first, so every number below is computed over the same set. The server's
        // @odata.count is not usable here — it counted the withdrawn rows too, which is why
        // the read does not ask for it.
        var rows = (result.Value!.Value ?? []).Where(row => !row.IsWithdrawn).ToList();

        var teams = rows
            .Select(row => (row.Team ?? row.ProjectName ?? string.Empty).Trim())
            .Where(label => label.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        return new AdoptionTally(
            Adoptions: rows.Count,
            Teams: teams,
            ActiveUses: rows.Count(row => string.IsNullOrWhiteSpace(row.CompletedOn)),
            CompletedUses: rows.Count(row => !string.IsNullOrWhiteSpace(row.CompletedOn)));
    }

    /// <summary>
    /// What a reader would otherwise have to infer from a null. Each note names the thing
    /// that is missing and why, so a model does not report an absence as a zero.
    /// </summary>
    private static IEnumerable<string> Notes(
        BackendResult<ODataPage<ParticipationRow>> participation,
        BackendResult<ODataPage<AdoptionRow>>? adoptions,
        MomentumRow? momentum,
        int voteRowsRead,
        int voteCount)
    {
        if (!participation.Ok)
        {
            yield return $"Participation is unavailable: {participation.Failure}";
        }

        if (adoptions is { Ok: false })
        {
            yield return $"Adoption is unavailable: {adoptions.Failure}";
        }

        if (momentum is null)
        {
            yield return
                "Demand rank is unavailable: cycai_momentum holds no row for this item. " +
                "The counts above are computed live from the engagement rows; rank is a " +
                "whole-catalogue ordering and is only available from that rollup.";
        }

        if (voteRowsRead < voteCount)
        {
            yield return
                $"votesLast30Days counts the first {voteRowsRead} of {voteCount} vote rows, " +
                "so treat it as a floor.";
        }
    }
}

/// <summary>OData query-string mechanics, in one place so escaping is not optional.</summary>
internal static class OData
{
    /// <summary>A string literal in a filter: single-quoted, escaping by doubling the quote.</summary>
    public static string Literal(string value) => value.Replace("'", "''", StringComparison.Ordinal);

    /// <summary>
    /// A whole <c>$filter</c> clause, percent-encoded. The expression carries spaces and
    /// quotes, both of which have to survive the trip as a query-string value.
    /// </summary>
    public static string Filter(string expression) => $"$filter={Uri.EscapeDataString(expression)}";
}

/// <summary>
/// A Dataverse collection response. <c>@odata.count</c> is the authoritative total — the
/// row array is one page of at most 5000.
/// </summary>
internal sealed record ODataPage<T>(
    [property: JsonPropertyName("@odata.count")] int? Count,
    IReadOnlyList<T>? Value);

internal sealed record VoteRow(
    [property: JsonPropertyName("createdon")] string? CreatedOn);

internal sealed record ParticipationRow(
    [property: JsonPropertyName("cycai_participationstatus")] int? Status)
{
    public const int ProposedValue = 100000000;
    public const int AcceptedValue = 100000001;
    public const int RejectedValue = 100000002;
    public const int WithdrawnValue = 100000003;
}

internal sealed record AdoptionRow(
    [property: JsonPropertyName("cycai_team")] string? Team,
    [property: JsonPropertyName("cycai_projectname")] string? ProjectName,
    [property: JsonPropertyName("cycai_completedon")] string? CompletedOn,
    [property: JsonPropertyName("cycai_adoptionstatus")] int? Status)
{
    public const int ExploringValue = 100000000;
    public const int ImplementingValue = 100000001;
    public const int UsingValue = 100000002;
    public const int WithdrawnValue = 100000003;

    /// <summary>
    /// A withdrawn adoption is a tombstone: the row is retained for history and counted
    /// nowhere.
    /// </summary>
    /// <remarks>
    /// A null status is NOT treated as withdrawn. Dataverse omits a field entirely when it
    /// is absent from the <c>$select</c>, so null means "not asked for" as often as it means
    /// "not set" — and defaulting to withdrawn would silently erase every adoption the day
    /// somebody trimmed the projection.
    /// </remarks>
    public bool IsWithdrawn => Status == WithdrawnValue;
}

internal sealed record MomentumRow(
    [property: JsonPropertyName("cycai_demandrank")] int? DemandRank,
    [property: JsonPropertyName("cycai_momentumscore")] double? MomentumScore,
    [property: JsonPropertyName("cycai_calculatedon")] string? CalculatedOn);
