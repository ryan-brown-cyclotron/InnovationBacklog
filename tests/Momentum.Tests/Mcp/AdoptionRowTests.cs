using Momentum.Mcp.Backlog;

namespace Momentum.Tests.Mcp;

/// <summary>
/// The withdrawn-adoption tombstone, as the MCP server sees it.
/// </summary>
/// <remarks>
/// Both failures here are silent and both produce numbers that look fine.
/// <para>
/// Treating a withdrawn row as active is the direction the timestamp cannot catch: a
/// withdrawal deliberately leaves <c>cycai_completedon</c> null, so a row nobody uses any
/// more would be filed as an active adoption for ever, and <c>get</c> would report a higher
/// count than the code app shows for the same solution.
/// </para>
/// <para>
/// Treating a NULL status as withdrawn is the opposite direction and worse. Dataverse omits
/// a field entirely when it is absent from the <c>$select</c> — the same trap
/// <c>_cycai_voterid_value</c> documents in the code app's rollups — so the day somebody
/// trims the projection, every adoption would vanish rather than fail loudly.
/// </para>
/// </remarks>
public class AdoptionRowTests
{
    private static AdoptionRow Row(int? status, string? completedOn = null) =>
        new(Team: "Platform", ProjectName: "Ops Console", CompletedOn: completedOn, Status: status);

    [Fact]
    public void IsWithdrawn_True_OnlyForTheWithdrawnChoice()
    {
        Assert.True(Row(AdoptionRow.WithdrawnValue).IsWithdrawn);

        Assert.False(Row(AdoptionRow.ExploringValue).IsWithdrawn);
        Assert.False(Row(AdoptionRow.ImplementingValue).IsWithdrawn);
        Assert.False(Row(AdoptionRow.UsingValue).IsWithdrawn);
    }

    [Fact]
    public void IsWithdrawn_False_WhenTheStatusWasNotSelected()
    {
        // Absent, not withdrawn. Failing open here keeps a trimmed projection to a wrong
        // status rather than an empty adoption list.
        Assert.False(Row(status: null).IsWithdrawn);
    }

    [Fact]
    public void IsWithdrawn_False_ForAnUnknownChoiceValue()
    {
        // A choice this build has never heard of degrades to "not withdrawn" for the same
        // reason: only the value that means withdrawn may exclude a row.
        Assert.False(Row(status: 100000099).IsWithdrawn);
    }

    [Fact]
    public void AWithdrawnRow_CarriesNoCompletionTimestamp()
    {
        // Which is exactly why the status has to be consulted at all: the timestamp alone
        // cannot tell a withdrawal from an adoption still in progress.
        var withdrawn = Row(AdoptionRow.WithdrawnValue);

        Assert.True(withdrawn.IsWithdrawn);
        Assert.True(string.IsNullOrWhiteSpace(withdrawn.CompletedOn));
    }
}
