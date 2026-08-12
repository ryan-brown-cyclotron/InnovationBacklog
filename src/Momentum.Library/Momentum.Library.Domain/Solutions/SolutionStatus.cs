namespace Momentum.Library.Domain.Solutions;

public enum SolutionStatus
{
    /// <summary>Shared, waiting for a reviewer. Not visible to the hub at large.</summary>
    AwaitingApproval,
    Published,
    Rejected,
    Retired,
    ProjectionFailed
}

/// <summary>
/// What a solution consists of.
///
/// One of three places this taxonomy is written down, and the last to be corrected:
/// it still declared Library / Service / Template / Application / Pattern / Other
/// after the other two moved. The others are
/// <c>SolutionKind</c> in packages/logic/src/domain/enums.ts and the
/// "Innovation Backlog Solution Type" picklist created by Provision-AdoProcess.ps1.
/// Change one, change all three.
///
/// The old taxonomy described the artefact, which told intake nothing: every member
/// of it was asked for a repository. These describe what the record consists of,
/// which is the distinction the form is generated from.
///
/// Serialized by NAME (<c>SolutionResponse.SolutionType</c> is a string), so the
/// declaration order carries no meaning and members may be appended freely.
/// </summary>
public enum SolutionType
{
    /// <summary>An approach or way of working. No repository — a worked example instead.</summary>
    Strategy,

    /// <summary>Something built and reusable: a library, service, template or application.</summary>
    CustomSolution,

    /// <summary>
    /// A packaged agent skill. Modelled but not yet offered at intake: its repository
    /// folder is created by skill intake rather than named by the author, so the web
    /// form has nothing coherent to ask for until the two are wired together.
    /// </summary>
    Skill
}
