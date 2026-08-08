using Momentum.Library.Domain.Identity;

namespace Momentum.Library.Domain.Visibility;

/// <summary>
/// Who may see an idea or a solution. Administrators set this; every read path
/// enforces it. Ordering is widest-to-narrowest so comparisons stay readable.
/// </summary>
public enum ItemVisibility
{
    /// <summary>Any authenticated user. The default for everything shared.</summary>
    Everyone,

    /// <summary>Approvers, administrators, and the person who shared it.</summary>
    Approvers,

    /// <summary>Administrators only — soft-removed from the hub without deleting it.</summary>
    Hidden
}

public static class ItemVisibilityRules
{
    /// <summary>
    /// Whether <paramref name="role"/> may see an item at this visibility.
    /// <paramref name="isOwner"/> is the person who shared it, who keeps sight of
    /// their own work up to the point an administrator hides it outright.
    /// </summary>
    public static bool CanSee(ItemVisibility visibility, Role role, bool isOwner) => visibility switch
    {
        ItemVisibility.Everyone => true,
        ItemVisibility.Approvers => isOwner || role is Role.Approver or Role.Administrator,
        ItemVisibility.Hidden => role is Role.Administrator,
        _ => false
    };

    /// <summary>
    /// Visibility and review together. Nothing shows up before it is approved
    /// except to the people who review it and the person who shared it — they
    /// need to see their own submission to track it.
    /// </summary>
    public static bool CanSee(ItemVisibility visibility, ApprovalState approval, Role role, bool isOwner)
    {
        if (approval != ApprovalState.Approved && !ApprovalStates.CanReview(role) && !isOwner)
            return false;
        return CanSee(visibility, role, isOwner);
    }

    /// <summary>Only administrators decide who can see what.</summary>
    public static bool CanChange(Role role) => role is Role.Administrator;
}
