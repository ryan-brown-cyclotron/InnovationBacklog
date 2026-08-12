import type { ActivityEntry, Comment } from "../../domain/collaboration.js";
import type { Adoption, IdeaSolutionLink, Participation } from "../../domain/engagement.js";
import type { SolutionIssue } from "../../domain/feedback.js";
import type { CurrentUser, UserRef } from "../../domain/identity.js";
import type { Idea } from "../../domain/idea.js";
import type { Milestone } from "../../domain/roadmap.js";
import type { Solution } from "../../domain/solution.js";

/**
 * A dataset shaped like the one `Momentum.Service --seed-demo` writes: enough
 * ideas, solutions, people and engagement to make every surface look real, with at
 * least one row exercising each rule that is easy to get wrong.
 *
 * Dates are fixed strings rather than computed offsets so a snapshot test does not
 * change meaning overnight.
 */

export interface MemoryVote {
  targetKey: string;
  userId: string;
  createdAt: string;
}

export interface MemorySeed {
  currentUserId: string;
  users: UserRef[];
  ideas: Idea[];
  solutions: Solution[];
  votes: MemoryVote[];
  adoptions: Adoption[];
  comments: Comment[];
  participation: Participation[];
  links: IdeaSolutionLink[];
  activity: ActivityEntry[];
  solutionIssues: SolutionIssue[];
  milestones: Milestone[];
}

const USERS: UserRef[] = [
  { id: "u-avery", displayName: "Avery Lin", email: "avery.lin@example.com" },
  { id: "u-blake", displayName: "Blake Moreau", email: "blake.moreau@example.com" },
  { id: "u-casey", displayName: "Casey Obi", email: "casey.obi@example.com" },
  { id: "u-devin", displayName: "Devin Park", email: "devin.park@example.com" },
  { id: "u-ellis", displayName: "Ellis Navarro", email: "ellis.navarro@example.com" },
  { id: "u-frankie", displayName: "Frankie Doyle", email: "frankie.doyle@example.com" },
  { id: "u-harper", displayName: "Harper Quinn", email: "harper.quinn@example.com" },
  { id: "u-jordan", displayName: "Jordan Reyes", email: "jordan.reyes@example.com" },
];

function idea(
  id: string,
  title: string,
  description: string,
  submittedBy: string,
  status: Idea["status"],
  createdAt: string,
  tags: string[],
  overrides: Partial<Idea> = {},
): Idea {
  return {
    id,
    type: "Backlog",
    status,
    title,
    description,
    submittedBy,
    canonicalSolutionId: null,
    createdAt,
    updatedAt: createdAt,
    visibility: "Everyone",
    tags,
    ...overrides,
  };
}

function solution(
  id: string,
  title: string,
  description: string,
  submittedBy: string,
  type: Solution["type"],
  createdAt: string,
  tags: string[],
  overrides: Partial<Solution> = {},
): Solution {
  return {
    id,
    title,
    description,
    type,
    status: "Published",
    repositoryOwner: "contoso",
    repositoryName: id,
    repositoryUrl: `https://github.com/contoso/${id}`,
    demoUrl: null,
    ownerId: submittedBy,
    useCount: 0,
    adoptedByProjects: [],
    createdAt,
    updatedAt: createdAt,
    publishedAt: createdAt,
    visibility: "Everyone",
    tags,
    ...overrides,
  };
}

const IDEAS: Idea[] = [
  idea("i-101", "Single sign-on for the partner portal",
    "Partners keep a separate password for the portal and call the service desk to reset it.",
    "u-avery", "Accepted", "2026-03-04T09:12:00Z", ["auth", "partners"]),

  idea("i-102", "Shared component library for internal tools",
    "Every internal tool rebuilds the same table, modal and date picker slightly differently.",
    "u-blake", "Accepted", "2026-03-11T14:40:00Z", ["frontend", "reuse"],
    { canonicalSolutionId: "s-201" }),

  idea("i-103", "Automated access reviews",
    "Quarterly access reviews are a spreadsheet exercise and are always late.",
    "u-casey", "AwaitingApproval", "2026-04-02T08:05:00Z", ["compliance", "automation"]),

  idea("i-104", "One place to find internal APIs",
    "There is no catalogue, so teams rediscover the same services by asking around.",
    "u-devin", "Accepted", "2026-04-15T11:20:00Z", ["discovery", "apis"]),

  idea("i-105", "Faster onboarding for contractors",
    "A contractor waits about nine days for the accounts they need on day one.",
    "u-ellis", "AwaitingApproval", "2026-05-06T16:32:00Z", ["onboarding", "identity"]),

  idea("i-106", "Retire the legacy reporting database",
    "Two reporting stores disagree, and nobody is sure which one finance uses.",
    "u-frankie", "TriageRunning", "2026-05-20T10:00:00Z", ["data", "legacy"]),

  idea("i-107", "Self-service environment provisioning",
    "Standing up a test environment is a ticket and a two-day wait.",
    "u-harper", "AwaitingApproval", "2026-06-01T13:45:00Z", ["platform", "devex"]),

  idea("i-108", "Consistent audit logging",
    "Each service logs a different shape, so cross-service investigations are manual.",
    "u-jordan", "Draft", "2026-06-18T09:00:00Z", ["observability"]),

  idea("i-109", "Document translation workflow",
    "Translations are emailed around and versions drift.",
    "u-avery", "Rejected", "2026-06-24T15:10:00Z", ["content"]),

  // Restricted: exercises the visibility filter and the owner exception.
  idea("i-110", "Vendor consolidation analysis",
    "Commercially sensitive while negotiations are open.",
    "u-casey", "AwaitingApproval", "2026-07-02T08:30:00Z", ["procurement"],
    { visibility: "Approvers" }),

  idea("i-111", "Incident timeline generator",
    "Reconstructing an incident timeline by hand takes longer than the incident did.",
    "u-devin", "Accepted", "2026-07-14T12:00:00Z", ["incidents", "automation"]),
];

const SOLUTIONS: Solution[] = [
  solution("s-201", "Fabric UI Kit", "Accessible React components with the house design tokens applied.",
    "u-blake", "CustomSolution", "2026-02-18T10:00:00Z", ["frontend", "reuse"],
    { demoUrl: "https://example.com/fabric-ui-kit", useCount: 6 }),

  solution("s-202", "Entra Auth Starter", "Drop-in Microsoft Entra authentication for internal web apps.",
    "u-avery", "CustomSolution", "2026-03-06T09:30:00Z", ["auth", "starter"], { useCount: 4 }),

  solution("s-203", "Service Catalogue API", "Registry of internal services with ownership and health.",
    "u-devin", "CustomSolution", "2026-04-22T15:00:00Z", ["discovery", "apis"], { useCount: 3 }),

  solution("s-204", "Access Review Bot", "Runs quarterly access reviews and chases the stragglers.",
    "u-casey", "CustomSolution", "2026-05-02T11:15:00Z", ["compliance", "automation"], { useCount: 2 }),

  solution("s-205", "Environment Vending Machine", "Self-service ephemeral environments from a pull request.",
    "u-harper", "CustomSolution", "2026-06-05T09:45:00Z", ["platform", "devex"], { useCount: 1 }),

  solution("s-206", "Structured Logging Conventions", "Shared log schema and the adapters for it.",
    "u-jordan", "Strategy", "2026-06-20T14:20:00Z", ["observability"], { useCount: 5 }),

  // Retired: approved once, still visible so people can see what a team moved off.
  solution("s-207", "Legacy Report Exporter", "Superseded by the Service Catalogue API.",
    "u-frankie", "CustomSolution", "2026-01-09T08:00:00Z", ["data", "legacy"],
    { status: "Retired", useCount: 2 }),
];

const VOTES: MemoryVote[] = [
  ...["u-blake", "u-casey", "u-devin", "u-ellis", "u-harper"].map((userId) => ({
    targetKey: "request:i-104", userId, createdAt: "2026-07-20T09:00:00Z",
  })),
  ...["u-avery", "u-jordan", "u-harper"].map((userId) => ({
    targetKey: "request:i-107", userId, createdAt: "2026-07-22T09:00:00Z",
  })),
  ...["u-blake", "u-frankie"].map((userId) => ({
    targetKey: "request:i-103", userId, createdAt: "2026-06-30T09:00:00Z",
  })),
  ...["u-avery", "u-blake", "u-casey", "u-devin"].map((userId) => ({
    targetKey: "solution:s-201", userId, createdAt: "2026-07-01T09:00:00Z",
  })),
  ...["u-ellis", "u-harper"].map((userId) => ({
    targetKey: "solution:s-206", userId, createdAt: "2026-07-11T09:00:00Z",
  })),
];

const ADOPTIONS: Adoption[] = [
  { id: "a-301", solutionId: "s-201", startedBy: "u-devin", projectName: "Partner Portal",
    team: "Experience", status: "Using", startedAt: "2026-03-01T09:00:00Z",
    updatedAt: "2026-04-10T09:00:00Z", completedAt: "2026-04-10T09:00:00Z" },
  { id: "a-302", solutionId: "s-201", startedBy: "u-harper", projectName: "Ops Console",
    team: "Platform", status: "Implementing", startedAt: "2026-05-14T09:00:00Z",
    updatedAt: "2026-06-02T09:00:00Z", completedAt: null },
  { id: "a-303", solutionId: "s-201", startedBy: "u-ellis", projectName: "Field App",
    team: null, status: "Exploring", startedAt: "2026-07-08T09:00:00Z",
    updatedAt: "2026-07-08T09:00:00Z", completedAt: null },
  { id: "a-304", solutionId: "s-202", startedBy: "u-casey", projectName: "Partner Portal",
    team: "Experience", status: "Using", startedAt: "2026-03-20T09:00:00Z",
    updatedAt: "2026-05-01T09:00:00Z", completedAt: "2026-05-01T09:00:00Z" },
  { id: "a-305", solutionId: "s-206", startedBy: "u-jordan", projectName: "Billing",
    team: "Revenue", status: "Implementing", startedAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-19T09:00:00Z", completedAt: null },
];

const COMMENTS: Comment[] = [
  { id: "c-401", subjectId: "i-104", subjectType: "Idea", authorId: "u-blake", body: "The Service Catalogue API already covers most of this.",
    attachments: [], createdAt: "2026-04-18T10:30:00Z" },
  { id: "c-402", subjectId: "i-104", subjectType: "Idea", authorId: "u-avery", body: "Can you confirm the ownership data is current?",
    attachments: [], createdAt: "2026-04-19T08:00:00Z" },
  // The audience that must never reach a submitter on any read path.
  { id: "c-403", subjectId: "i-104", subjectType: "Idea", authorId: "u-agent", body: "Creation triage: overlaps s-203. Recommend linking rather than accepting.",
    attachments: [], createdAt: "2026-04-19T08:05:00Z" },
  { id: "c-404", subjectId: "s-201", subjectType: "Solution", authorId: "u-harper", body: "Adopted this for Ops Console. Migration took about a day.",
    attachments: [], createdAt: "2026-05-15T13:00:00Z" },
  { id: "c-405", subjectId: "i-110", subjectType: "Idea", authorId: "u-avery", body: "Hold until the negotiation closes.",
    attachments: [], createdAt: "2026-07-03T09:00:00Z" },
];

const PARTICIPATION: Participation[] = [
  { id: "p-501", itemType: "Idea", itemId: "i-107", requestedBy: "u-jordan",
    message: "I have done this at a previous employer and would like to help.",
    status: "Proposed", decidedBy: null, rationale: null,
    createdAt: "2026-07-05T09:00:00Z", updatedAt: "2026-07-05T09:00:00Z", decidedAt: null },
  { id: "p-502", itemType: "Solution", itemId: "s-206", requestedBy: "u-ellis",
    message: "Happy to write the Python adapter.", status: "Accepted",
    decidedBy: "u-jordan", rationale: "Adapter is on the roadmap and unowned.",
    createdAt: "2026-06-25T09:00:00Z", updatedAt: "2026-06-27T09:00:00Z",
    decidedAt: "2026-06-27T09:00:00Z" },
];

const LINKS: IdeaSolutionLink[] = [
  { ideaId: "i-102", solutionId: "s-201", addedBy: "u-avery", addedAt: "2026-03-13T09:00:00Z" },
  { ideaId: "i-101", solutionId: "s-202", addedBy: "u-avery", addedAt: "2026-03-07T09:00:00Z" },
  { ideaId: "i-104", solutionId: "s-203", addedBy: "u-avery", addedAt: "2026-04-19T09:00:00Z" },
];

const ACTIVITY: ActivityEntry[] = [
  { id: "act-601", action: "solution.published", resourceType: "solution", resourceId: "s-206",
    subjectId: "s-206", actorType: "User", actorId: "u-jordan",
    summary: "Structured Logging Conventions", audience: "SubmitterAndApprovers",
    occurredAt: "2026-06-20T14:20:00Z" },
  { id: "act-602", action: "adoption.started", resourceType: "solution", resourceId: "s-201",
    subjectId: "s-201", actorType: "User", actorId: "u-ellis",
    summary: "Field App", audience: "SubmitterAndApprovers", occurredAt: "2026-07-08T09:00:00Z" },
  { id: "act-603", action: "request.created", resourceType: "request", resourceId: "i-111",
    subjectId: "i-111", actorType: "User", actorId: "u-devin",
    summary: "Incident timeline generator", audience: "SubmitterAndApprovers",
    occurredAt: "2026-07-14T12:00:00Z" },
  { id: "act-604", action: "vote.added", resourceType: "request", resourceId: "i-104",
    subjectId: "i-104", actorType: "User", actorId: "u-harper",
    summary: "One place to find internal APIs", audience: "SubmitterAndApprovers",
    occurredAt: "2026-07-20T09:00:00Z" },
  { id: "act-605", action: "item.visibilityChanged", resourceType: "request", resourceId: "i-110",
    subjectId: "i-110", actorType: "User", actorId: "u-avery",
    summary: "Vendor consolidation analysis", audience: "ApproversOnly",
    occurredAt: "2026-07-02T08:35:00Z" },
];

/**
 * Reported problems, all on s-201 so one solution exercises the whole tab.
 *
 * s-206 deliberately has none, so the served-but-empty state is reachable too — the
 * one that must read "nobody has reported anything" rather than "we could not ask".
 * ISS-703 is reported by the current user (u-avery), which is what makes the
 * reporter-may-withdraw branch of `canSetIssueStatus` reachable in the UI.
 */
const SOLUTION_ISSUES: SolutionIssue[] = [
  { id: "iss-701", solutionId: "s-201", title: "Focus ring is invisible on the dark surface tokens",
    description: "The 2px outline resolves to the same value as the elevated background.",
    status: "Doing", reportedBy: "u-harper", assignedTo: "u-avery",
    createdAt: "2026-07-28T09:00:00Z", updatedAt: "2026-08-09T11:00:00Z" },
  { id: "iss-702", solutionId: "s-201", title: "DataGrid drops its column widths after a re-render",
    description: "Only when the grid is inside a flex parent with min-height: 0.",
    status: "To Do", reportedBy: "u-devin", assignedTo: null,
    createdAt: "2026-08-04T14:20:00Z", updatedAt: "2026-08-04T14:20:00Z" },
  { id: "iss-703", solutionId: "s-201", title: "Add a changelog so adopters can see what moved",
    description: "Two teams have been caught by a breaking prop rename.",
    status: "To Do", reportedBy: "u-avery", assignedTo: null,
    createdAt: "2026-08-07T08:10:00Z", updatedAt: "2026-08-07T08:10:00Z" },
  { id: "iss-704", solutionId: "s-201", title: "Storybook build fails on Node 22",
    description: "Resolved by pinning the vite plugin.",
    status: "Done", reportedBy: "u-ellis", assignedTo: "u-avery",
    createdAt: "2026-06-30T10:00:00Z", updatedAt: "2026-07-11T16:45:00Z" },
  { id: "iss-705", solutionId: "s-202", title: "Token refresh races on a slow network",
    description: "Two concurrent refreshes, second one 401s.",
    status: "To Do", reportedBy: "u-casey", assignedTo: null,
    createdAt: "2026-08-01T13:00:00Z", updatedAt: "2026-08-01T13:00:00Z" },
];

/**
 * Roadmap entries. Between them these cover every rendering branch:
 * an explicit `targetLabel` that must win over the date, a date-only entry that must
 * fall back to formatting, and an undated entry that must sort last.
 */
const MILESTONES: Milestone[] = [
  { id: "ms-801", solutionId: "s-201", title: "Design tokens split into their own package",
    note: "Consumed by three apps without pulling in React.", status: "Shipped",
    targetDate: "2026-05-01T00:00:00Z", targetLabel: "",
    createdAt: "2026-03-01T09:00:00Z", updatedAt: "2026-05-06T09:00:00Z" },
  { id: "ms-802", solutionId: "s-201", title: "Accessibility audit against WCAG 2.2 AA",
    note: "Currently passing 41 of 46 checks.", status: "InProgress",
    targetDate: "2026-09-01T00:00:00Z", targetLabel: "",
    createdAt: "2026-06-12T09:00:00Z", updatedAt: "2026-08-10T09:00:00Z" },
  { id: "ms-803", solutionId: "s-201", title: "Dark theme",
    note: "Blocked on the token split landing everywhere.", status: "Planned",
    targetDate: "2026-10-01T00:00:00Z", targetLabel: "Q4 2026",
    createdAt: "2026-06-12T09:00:00Z", updatedAt: "2026-06-12T09:00:00Z" },
  { id: "ms-804", solutionId: "s-201", title: "Figma kit kept in step automatically",
    note: "No date until someone owns it.", status: "Planned",
    targetDate: null, targetLabel: "",
    createdAt: "2026-07-01T09:00:00Z", updatedAt: "2026-07-01T09:00:00Z" },
  { id: "ms-805", solutionId: "s-201", title: "Ship a codemod for the v1 prop renames",
    note: "Superseded by the changelog work.", status: "Cancelled",
    targetDate: "2026-08-01T00:00:00Z", targetLabel: "",
    createdAt: "2026-05-02T09:00:00Z", updatedAt: "2026-07-19T09:00:00Z" },
];

export function defaultSeed(): MemorySeed {
  return {
    currentUserId: "u-avery",
    users: USERS,
    ideas: IDEAS,
    solutions: SOLUTIONS,
    votes: VOTES,
    adoptions: ADOPTIONS,
    comments: COMMENTS,
    participation: PARTICIPATION,
    links: LINKS,
    activity: ACTIVITY,
    solutionIssues: SOLUTION_ISSUES,
    milestones: MILESTONES,
  };
}
