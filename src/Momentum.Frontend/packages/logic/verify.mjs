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

section("Links are a reviewer action");
check(
  "a submitter cannot link",
  await throwsWith("permission", () => submitter.approvals.linkSolution("i-105", "s-205")),
);
const link = await approver.approvals.linkSolution("i-105", "s-205");
check("an approver can link", link.ideaId === "i-105" && link.solutionId === "s-205");
check(
  "the link carries no approval or relationship",
  !("approval" in link) && !("relationship" in link),
);
const relinked = await approver.approvals.linkSolution("i-105", "s-205");
check("linking the same pair twice is idempotent", relinked.addedAt === link.addedAt);
check(
  "a submitter cannot unlink",
  await throwsWith("permission", () => submitter.approvals.unlinkSolution("i-105", "s-205")),
);

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
check(
  "active and completed adoptions split on status, not on completedAt",
  solutionRollup.activeUses === 2 && solutionRollup.completedUses === 1,
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
