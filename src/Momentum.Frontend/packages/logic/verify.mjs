/**
 * Behavioural checks for the in-memory provider.
 *
 * Typechecking proves the contracts are *implementable*; this proves the rules are
 * actually enforced. Everything asserted here is something a real adapter must also
 * do, and several are things a previous provider in this repo got wrong: item
 * visibility was silently dropped, and adoption statuses were invented that the
 * domain never had.
 *
 *   node verify.mjs        (or: pnpm --filter @innovation-backlog/logic verify)
 *
 * Run against dist, so it exercises what consumers actually import.
 */
import { createMemoryProvider } from "./dist/index.js";

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

async function throwsWith(category, run) {
  try {
    await run();
    return false;
  } catch (error) {
    return error?.category === category;
  }
}

const admin = createMemoryProvider({ role: "Administrator" });
const approver = createMemoryProvider({ role: "Approver" });
const submitter = createMemoryProvider({ role: "Submitter" });

// ---------------------------------------------------------------------------

section("Item visibility");
// i-110 is visibility=Approvers and owned by u-casey; the seed's current user is u-avery.
check("administrator sees a restricted idea", (await admin.ideas.getIdea("i-110")) !== null);
check("approver sees a restricted idea", (await approver.ideas.getIdea("i-110")) !== null);
check("submitter cannot see a restricted idea", (await submitter.ideas.getIdea("i-110")) === null);
check(
  "restricted idea is absent from a submitter's list",
  !(await submitter.ideas.listIdeas()).items.some((i) => i.id === "i-110"),
);
check(
  "missing and invisible are indistinguishable",
  (await submitter.ideas.getIdea("i-110")) === (await submitter.ideas.getIdea("does-not-exist")),
);

section("Comments are public");
// No audience tier: an ADO work item comment is readable by anyone who can read the
// item, so restricting a conversation means restricting the ITEM, via its area path.
const subject = { itemType: "Idea", itemId: "i-104" };
const submitterComments = await submitter.collaboration.listComments(subject);
const approverComments = await approver.collaboration.listComments(subject);
check("every reader sees the same thread", submitterComments.length === approverComments.length);
check("comments carry no audience", submitterComments.every((c) => !("audience" in c)));
const posted = await submitter.collaboration.addComment({
  subjectId: "i-104",
  subjectType: "Idea",
  body: "anyone who can see the item can see this",
});
check("a submitter can comment", posted.body.length > 0);

section("Votes");
const target = { itemType: "Idea", itemId: "i-104" };
const baseline = await admin.engagement.getVoteSummary(target);
const first = await admin.engagement.addVote(target);
const second = await admin.engagement.addVote(target);
check("first vote increments", first.count === baseline.count + 1);
check("voting twice is idempotent", second.count === first.count);
check("votedByMe reflects the caller", second.votedByMe === true);
const removed = await admin.engagement.removeVote(target);
check(
  "removing returns to baseline",
  removed.count === baseline.count && removed.votedByMe === false,
);

section("Proposing a link is open; approving it is not");
/*
  Three things need approval: ideas, solutions, and the links between them. Proposing is
  open to anyone who can see both items and produces a PENDING link — in the real adapter
  that means a Dataverse row and nothing at all in Azure DevOps, so every reader of ADO
  relations keeps showing approved links only.
*/
const link = await submitter.approvals.linkSolution("i-105", "s-205");
check("a submitter can propose a link", link.ideaId === "i-105" && link.solutionId === "s-205");
check("and it starts Pending, not true", link.approval === "Pending");
check("with nothing decided", link.decidedBy === null && link.decidedAt === null);

const relinked = await approver.approvals.linkSolution("i-105", "s-205");
check("proposing the same pair twice is idempotent", relinked.addedAt === link.addedAt);

check(
  "a submitter cannot approve",
  await throwsWith("permission", () =>
    submitter.approvals.approveLink("i-105", "s-205", "looks right"),
  ),
);
check(
  "a decision requires a rationale, like every other decision",
  await throwsWith("validation", () => approver.approvals.approveLink("i-105", "s-205", "   ")),
);

const pendingForReviewer = await approver.approvals.listPendingLinks();
check(
  "the proposal reaches the review queue with both titles",
  pendingForReviewer.some(
    (p) => p.ideaId === "i-105" && p.solutionId === "s-205" && p.ideaTitle && p.solutionTitle,
  ),
);
check(
  "a submitter's queue is empty rather than an error",
  (await submitter.approvals.listPendingLinks()).length === 0,
);

const approved = await approver.approvals.approveLink("i-105", "s-205", "Answers it directly.");
check("an approver can approve", approved.approval === "Approved");
check(
  "and the decision is recorded",
  approved.rationale === "Answers it directly." && approved.decidedAt !== null,
);
check(
  "an approved link leaves the queue",
  !(await approver.approvals.listPendingLinks()).some((p) => p.solutionId === "s-205"),
);
check(
  "deciding twice is refused rather than re-stamping somebody else's decision",
  await throwsWith("notFound", () =>
    approver.approvals.approveLink("i-105", "s-205", "again"),
  ),
);

// Rejection: decided, and never becomes true.
await submitter.approvals.linkSolution("i-106", "s-205");
const rejected = await approver.approvals.rejectLink("i-106", "s-205", "Different problem.");
check("an approver can reject", rejected.approval === "Rejected");
check(
  "a rejected pair is not re-queued by proposing it again",
  (await submitter.approvals.linkSolution("i-106", "s-205")).approval === "Rejected",
);

section("Removing an approved link");
// s-205 is owned by u-harper; the seed's current user is u-avery.
check(
  "a submitter cannot unlink somebody else's solution",
  await throwsWith("permission", () => submitter.approvals.unlinkSolution("i-105", "s-205")),
);
check(
  "an approver can unlink",
  (await approver.approvals.unlinkSolution("i-105", "s-205")) === undefined,
);
check(
  "and the pair can then be proposed again",
  (await submitter.approvals.linkSolution("i-105", "s-205")).approval === "Pending",
);
// s-202 IS owned by u-avery, so the owner exception is reachable without a role.
await submitter.approvals.linkSolution("i-105", "s-202");
check(
  "the solution's owner can unlink it without a role",
  (await submitter.approvals.unlinkSolution("i-105", "s-202")) === undefined,
);

section("Editing an idea belongs to its author or a reviewer");
// i-107 is u-blake's; i-109 is u-avery's, the seed's current user.
check(
  "a submitter cannot edit somebody else's idea",
  await throwsWith("permission", () => submitter.ideas.updateIdea("i-107", { title: "hijacked" })),
);
check(
  "the author can edit their own",
  (await submitter.ideas.updateIdea("i-109", { title: "Document translation workflow v2" }))
    .title === "Document translation workflow v2",
);
check(
  "an approver can edit anyone's",
  (await approver.ideas.updateIdea("i-107", { title: "Retitled by a reviewer" })).title ===
    "Retitled by a reviewer",
);

// NOTE: the adoption sections are at the END of this file, not here. Every provider
// built from `defaultSeed()` shares its arrays, so a mutation is visible to all three —
// and the adoption checks change statuses that the rollup section below asserts on.

section("Approvals degrade rather than throw");
const submitterInbox = await submitter.approvals.getInbox();
check(
  "submitter inbox is empty and marked unavailable",
  submitterInbox.unavailable === "permission" && submitterInbox.ideas.length === 0,
);
check("approver inbox has items", (await approver.approvals.getInbox()).ideas.length > 0);
check(
  "a decision requires a rationale",
  await throwsWith("validation", () => approver.approvals.acceptIdea("i-103", "   ")),
);

section("Rollups");
const rollups = await admin.ideas.getIdeaRollups(["i-104"]);
check("vote count is rolled up", rollups["i-104"].votes === 5);
check(
  "comment count is the same for every reader",
  (await submitter.ideas.getIdeaRollups(["i-104"]))["i-104"].comments ===
    (await approver.ideas.getIdeaRollups(["i-104"]))["i-104"].comments,
);
const solutionRollup = (await admin.solutions.getSolutionRollups(["s-201"]))["s-201"];
// s-201 holds four adoptions: a-301 Using, a-302 Implementing, a-303 and a-306 Exploring.
check(
  "active and completed adoptions split on status, not on completedAt",
  solutionRollup.activeUses === 3 && solutionRollup.completedUses === 1,
);
// s-202 holds a-304 (Using) and a-307 (Withdrawn). The withdrawn row is counted nowhere,
// which is asserted here before any mutation has had a chance to muddy it.
const withdrawnRollup = (await admin.solutions.getSolutionRollups(["s-202"]))["s-202"];
check(
  "a withdrawn adoption is counted in nothing",
  withdrawnRollup.adoptions === 1 &&
    withdrawnRollup.activeUses === 0 &&
    withdrawnRollup.completedUses === 1,
);
check(
  "and is absent from the list",
  !(await admin.engagement.listAdoptions("s-202")).some((a) => a.id === "a-307"),
);

section("Tag normalization");
const tagged = await admin.ideas.createIdea({
  title: "t",
  description: "d",
  type: "Backlog",
  tags: ["  Alpha  ", "alpha", "a  b", "", "c", "d", "e", "f", "g", "h", "i"],
});
check(
  "deduped case-insensitively, first spelling wins",
  tagged.tags[0] === "Alpha" && !tagged.tags.includes("alpha"),
);
check("internal whitespace collapsed", tagged.tags.includes("a b"));
check("capped at 8", tagged.tags.length === 8);

// ---------------------------------------------------------------------------
// Adoption last, because these mutate statuses the rollup section asserts on and
// every provider shares the seed's arrays.
// ---------------------------------------------------------------------------

section("Managing an adoption: whoever recorded it, or a reviewer");
/*
  Deliberately NARROWER than canEditSolution: the solution's owner is NOT included. An
  adoption is somebody else's report about their own team, so owning the thing being
  adopted confers no standing over the report.

  a-302 belongs to u-harper; a-306 belongs to u-avery, the seed's current user. s-201 is
  owned by u-blake, so nobody here owns it — and `ownerAsSubmitter` below covers the case
  that actually distinguishes this rule from canEditSolution.
*/
check(
  "startedByMe is answered by the provider, not the caller",
  (await submitter.engagement.listAdoptions("s-201")).find((a) => a.id === "a-306")
    ?.startedByMe === true,
);
check(
  "and is false for somebody else's",
  (await submitter.engagement.listAdoptions("s-201")).find((a) => a.id === "a-302")
    ?.startedByMe === false,
);
check(
  "a submitter cannot move somebody else's adoption",
  await throwsWith("permission", () =>
    submitter.engagement.updateAdoption("s-201", "a-302", { status: "Using" }),
  ),
);
check(
  "whoever recorded it can move their own",
  (await submitter.engagement.updateAdoption("s-201", "a-306", { status: "Implementing" }))
    .status === "Implementing",
);
check(
  "an approver can move anyone's",
  (await approver.engagement.updateAdoption("s-201", "a-302", { status: "Implementing" }))
    .status === "Implementing",
);
check(
  "a submitter cannot withdraw somebody else's",
  await throwsWith("permission", () => submitter.engagement.withdrawAdoption("s-201", "a-302")),
);
/*
  The case that proves this rule is not `canEditSolution` under another name.

  s-202 is owned by u-avery — the seed's current user — and a-304 is u-casey's adoption of
  it. So `submitter` here IS the owner of the solution and is refused anyway, which is the
  one outcome that distinguishes the two predicates.
*/
check(
  "the solution's own owner cannot withdraw somebody else's adoption of it",
  await throwsWith("permission", () => submitter.engagement.withdrawAdoption("s-202", "a-304")),
);
check(
  "nor move its stage",
  await throwsWith("permission", () =>
    submitter.engagement.updateAdoption("s-202", "a-304", { status: "Exploring" }),
  ),
);

section("Withdrawal is a tombstone");
const beforeWithdraw = await submitter.engagement.listAdoptions("s-201");
const withdrawn = await submitter.engagement.withdrawAdoption("s-201", "a-306");
check("status becomes Withdrawn", withdrawn.status === "Withdrawn");
// completedAt is what the rollups read to mean "rolled out", and a withdrawal is the
// opposite claim — stamping it would turn a stop into a success.
check("completedAt is not stamped", withdrawn.completedAt === null);
const afterWithdraw = await submitter.engagement.listAdoptions("s-201");
check("the row leaves the list", afterWithdraw.length === beforeWithdraw.length - 1);
check("and cannot be found in it", !afterWithdraw.some((a) => a.id === "a-306"));
check(
  "the count falls with it",
  (await admin.solutions.getSolutionRollups(["s-201"]))["s-201"].adoptions === 3,
);
/*
  Retained, not deleted — the whole point of a tombstone, and the reason this is a status
  rather than a DELETE. The row is still addressable, so a historical rollup that counted
  it has something to point at.
*/
check(
  "the row itself survives",
  (await approver.engagement.updateAdoption("s-201", "a-306", { projectName: "Research Desk" }))
    .id === "a-306",
);

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
