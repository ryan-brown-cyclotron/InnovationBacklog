import type {
  AdoptionStatus,
  HubItemRef,
  HubItemType,
  InnovationBacklogProvider,
  ItemVisibility,
  MilestoneStatus,
  SolutionIssueStatus,
  SolutionKind,
} from "@innovation-backlog/logic";
import type { IService } from "@momentum/sdk";
import { toSearchRow } from "./ado/items.js";

/**
 * Adapts `@momentum/ui`'s route-string seam onto the typed provider.
 *
 * The shared UI — every page, panel and modal the web app has — talks to its host
 * through `IService.callTool("GET:requests/123")`. Rather than rebuild those
 * surfaces against the typed contract, the code app implements that one function
 * on top of `InnovationBacklogProvider`. The result is the same `<App/>`, byte for
 * byte, so the code app cannot drift from the web app by construction: there is
 * only one UI.
 *
 * This is deliberately a thin translation layer, and the ONLY place in the app that
 * knows route strings exist. Everything below it is typed.
 *
 * Response shapes match what the UI expects, which is the old wire shape. That is
 * mostly the domain shape already — the domain types were built with the same field
 * names on purpose — so the differences are envelopes (`{ items, totalCount }`) and
 * a few list-vs-page mismatches, handled per route below.
 */
export function createCallToolService(provider: InnovationBacklogProvider): IService {
  const ref = (itemType: HubItemType, itemId: string): HubItemRef => ({ itemType, itemId });

  /**
   * Translate the UI's item-type vocabulary into the domain's.
   *
   * The shared UI predates the rename and still says "Request" where the domain
   * says "Idea" — and says it inconsistently: `Request`, `request` and `requests`
   * all appear. Casting instead of translating is what produced
   * "Unknown choice 'Request'" when a vote tried to resolve the Dataverse choice
   * value. Anything that is not recognisably a solution is an idea.
   */
  function hubItemType(value: unknown): HubItemType {
    return String(value ?? "").toLowerCase().startsWith("sol") ? "Solution" : "Idea";
  }

  /** `GET:requests/12/comments?take=5` -> { method, segments, query }. */
  function parse(name: string) {
    const separator = name.indexOf(":");
    const method = name.slice(0, separator).toUpperCase();
    const route = name.slice(separator + 1);
    const [path, search = ""] = route.split("?");
    return {
      method,
      segments: (path ?? "").split("/").filter(Boolean),
      query: new URLSearchParams(search),
    };
  }

  return {
    async callTool(name, args) {
      const { method, segments, query } = parse(name);
      const body = (args?.body ?? {}) as Record<string, unknown>;
      const [head, second, third, fourth, fifth] = segments;
      const str = (value: unknown, fallback = "") =>
        typeof value === "string" ? value : fallback;

      // ---------------------------------------------------------------- search
      if (head === "search") {
        return provider.search({
          query: query.get("query") ?? "",
          take: Number(query.get("take") ?? 25),
          skip: Number(query.get("skip") ?? 0),
        });
      }

      // -------------------------------------------------------------- insights
      if (head === "insights") {
        // A capability: absent means the host cannot compute these honestly, and the
        // dashboard renders its unavailable state rather than a page of zeros.
        if (!provider.insights) throw new Error("This backend has no insights.");
        return provider.insights.get();
      }

      // -------------------------------------------------------------- activity
      if (head === "activity") {
        return provider.collaboration.listActivity({ take: Number(query.get("take") ?? 50) });
      }

      // ------------------------------------------------------------- approvals
      if (head === "approvals") {
        const inbox = await provider.approvals.getInbox();
        if (second === "inbox") return inbox.ideas;
        if (second === "solutions") return inbox.solutions;
        // Links carry no approval state any more — they are reviewer-created, so
        // nothing is ever pending. The UI's link queue is permanently empty rather
        // than removed, so the shared component keeps working unchanged.
        if (second === "links") return [];
      }

      // ----------------------------------------------------------- attachments
      if (head === "attachments") {
        if (method === "POST") {
          return provider.collaboration.uploadAttachment({
            fileName: str(body.fileName),
            contentType: str(body.contentType) || undefined,
            contentBase64: str(body.contentBase64),
          });
        }
        if (second) return provider.collaboration.getAttachment(second);
      }

      // ----------------------------------------------------------------- votes
      if (head === "votes") {
        const target = ref(
          hubItemType(str(body.itemType) || query.get("itemType")),
          str(body.itemId) || query.get("itemId") || "",
        );
        if (method === "POST") return provider.engagement.addVote(target);
        if (method === "DELETE") return provider.engagement.removeVote(target);
        return provider.engagement.getVoteSummary(target);
      }

      // ----------------------------------------------------------- participation
      if (head === "participation") {
        if (second === "mine") return provider.engagement.listMyParticipation();
        if (method === "POST" && second && third === "withdraw") {
          return provider.engagement.withdrawParticipation(second);
        }
        if (method === "POST") {
          return provider.engagement.requestParticipation({
            itemType: hubItemType(body.itemType),
            itemId: str(body.itemId),
            message: str(body.message),
          });
        }
      }

      // ----------------------------------------------------------------- ideas
      if (head === "requests") {
        if (!second) {
          if (method === "POST") {
            return provider.ideas.createIdea({
              title: str(body.title),
              description: str(body.description),
              type: "Backlog",
              tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
            });
          }
          // The UI expects a bare array here, not a page envelope.
          return (await provider.ideas.listIdeas({ mineOnly: true })).items;
        }

        if (second === "summary") return provider.ideas.getIdeaRollups();

        const ideaId = second;

        if (third === "comments") {
          if (method === "POST") {
            return provider.collaboration.addComment({
              subjectId: ideaId,
              subjectType: "Idea",
              body: str(body.body),
              attachmentIds: Array.isArray(body.attachmentIds)
                ? (body.attachmentIds as string[])
                : undefined,
            });
          }
          return provider.collaboration.listComments(ref("Idea", ideaId));
        }

        if (third === "activity") {
          return provider.collaboration.listActivity({ subjectId: ideaId, subjectType: "Idea" });
        }
        if (third === "decisions") return provider.approvals.listDecisions(ideaId);
        if (third === "solutions") return provider.ideas.listLinkedSolutions(ideaId);

        if (third === "link") return provider.approvals.linkSolution(ideaId, str(body.solutionId));
        if (third === "unlink") {
          await provider.approvals.unlinkSolution(ideaId, str(body.solutionId));
          return null;
        }
        // A link decision is a no-op: reviewer-created links are never pending.
        if (third === "links" && fourth) return null;

        if (third === "canonical") {
          return provider.approvals.selectCanonicalSolution(ideaId, str(body.solutionId));
        }
        if (third === "accept") return provider.approvals.acceptIdea(ideaId, str(body.rationale));
        if (third === "reject") return provider.approvals.rejectIdea(ideaId, str(body.rationale));

        if (third === "visibility" && method === "PATCH") {
          return setVisibility("Idea", ideaId, str(body.visibility) as ItemVisibility);
        }

        // Guarded on `!third` for the reason spelled out on the solutions branch
        // below: an unrecognized PATCH sub-route must not fall through to a
        // whole-record update, and must not fall through to a read reporting success.
        if (method === "PATCH" && !third) {
          return provider.ideas.updateIdea(ideaId, {
            title: str(body.title) || undefined,
            description: str(body.description) || undefined,
            // NOT `str(body.tags) || undefined`: that conflates "unchanged" with
            // "cleared", and clearing every tag is a thing people do.
            tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
          });
        }
        return provider.ideas.getIdea(ideaId);
      }

      // ------------------------------------------------------------- solutions
      if (head === "solutions") {
        if (!second) {
          if (method === "POST") {
            return provider.solutions.createSolution({
              title: str(body.title),
              description: str(body.description),
              // "Other" was the old taxonomy's catch-all and is no longer a member
              // of SolutionKind or of the ADO picklist — a malformed call defaulting
              // to it would have been rejected by the field it was written to.
              solutionType: (str(body.solutionType) || "CustomSolution") as SolutionKind,
              repositoryOwner: str(body.repositoryOwner),
              repositoryName: str(body.repositoryName),
              repositoryUrl: str(body.repositoryUrl),
              demoUrl: str(body.demoUrl) || undefined,
              tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
            });
          }
          // Search rows, not raw domain objects: consumers read `itemId`/`itemType`
          // off these, and a raw Solution carries neither — which is what stopped
          // solutions from opening when clicked.
          const page = await provider.solutions.listSolutions({
            search: query.get("query") || undefined,
          });
          return {
            items: page.items.map(toSearchRow),
            totalCount: page.total ?? page.items.length,
          };
        }

        if (second === "summary") return provider.solutions.getSolutionRollups();

        const solutionId = second;

        if (third === "comments") {
          if (method === "POST") {
            return provider.collaboration.addComment({
              subjectId: solutionId,
              subjectType: "Solution",
              body: str(body.body),
              attachmentIds: Array.isArray(body.attachmentIds)
                ? (body.attachmentIds as string[])
                : undefined,
            });
          }
          return provider.collaboration.listComments(ref("Solution", solutionId));
        }

        if (third === "activity") {
          return provider.collaboration.listActivity({
            subjectId: solutionId,
            subjectType: "Solution",
          });
        }
        if (third === "requests") return provider.solutions.listLinkedIdeas(solutionId);

        if (third === "use") {
          if (method === "POST" && fourth && fifth === "complete") {
            return provider.engagement.completeAdoption(solutionId, fourth);
          }
          if (method === "PATCH" && fourth) {
            return provider.engagement.updateAdoption(solutionId, fourth, {
              status: (str(body.status) || undefined) as AdoptionStatus | undefined,
              projectName: str(body.projectName) || undefined,
              team: str(body.team) || undefined,
            });
          }
          if (method === "POST") {
            return provider.engagement.startAdoption(solutionId, {
              projectName: str(body.projectName),
              team: str(body.team) || undefined,
              status: (str(body.status) || undefined) as AdoptionStatus | undefined,
            });
          }
          return provider.engagement.listAdoptions(solutionId);
        }

        if (third === "issues") {
          const issues = provider.solutions.issues;
          // Absent capability, not failure: App.tsx loads this through
          // Promise.allSettled and hides the tab rather than banner-ing the modal.
          if (!issues) throw new Error("This backend has no issues.");

          if (method === "POST") {
            return issues.createIssue(solutionId, {
              title: str(body.title),
              description: str(body.description),
            });
          }
          if (method === "PATCH" && fourth) {
            return issues.updateIssue(solutionId, fourth, {
              title: str(body.title) || undefined,
              description: str(body.description) || undefined,
              status: (str(body.status) || undefined) as SolutionIssueStatus | undefined,
            });
          }
          return issues.listIssues(solutionId);
        }

        if (third === "milestones") {
          const roadmap = provider.solutions.roadmap;
          if (!roadmap) throw new Error("This backend has no roadmap.");

          if (method === "POST") {
            return roadmap.createMilestone(solutionId, {
              title: str(body.title),
              note: str(body.note) || undefined,
              targetDate: str(body.targetDate) || undefined,
              targetLabel: str(body.targetLabel) || undefined,
              status: (str(body.status) || undefined) as MilestoneStatus | undefined,
            });
          }
          if (method === "DELETE" && fourth) {
            await roadmap.deleteMilestone(solutionId, fourth);
            return null;
          }
          if (method === "PATCH" && fourth) {
            return roadmap.updateMilestone(solutionId, fourth, {
              title: str(body.title) || undefined,
              note: str(body.note) || undefined,
              // `null` clears the date and must survive; only `undefined` means
              // "leave it alone".
              targetDate: body.targetDate === undefined ? undefined : str(body.targetDate) || null,
              targetLabel: str(body.targetLabel) || undefined,
              status: (str(body.status) || undefined) as MilestoneStatus | undefined,
            });
          }
          return roadmap.listMilestones(solutionId);
        }

        if (third === "accept") {
          return provider.approvals.acceptSolution(solutionId, str(body.rationale));
        }
        if (third === "reject") {
          return provider.approvals.rejectSolution(solutionId, str(body.rationale));
        }
        if (third === "visibility" && method === "PATCH") {
          return setVisibility("Solution", solutionId, str(body.visibility) as ItemVisibility);
        }

        /*
          Guarded, and it must stay guarded.

          Without this branch a bare `PATCH:solutions/123` fell through to the
          getSolution below and returned HTTP 200 with the UNCHANGED record — a
          mutation that silently read, and reported success for a save that never
          happened. Mirrors the ideas branch above.
        */
        if (method === "PATCH" && !third) {
          return provider.solutions.updateSolution(solutionId, {
            description: str(body.description) || undefined,
            // NOT `str(body.tags) || undefined`: that conflates "unchanged" with
            // "cleared", and clearing every tag is a thing people do.
            tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
          });
        }

        return provider.solutions.getSolution(solutionId);
      }

      throw new Error(`Unsupported route: ${name}`);
    },
  };

  /** Absent capability is not failure — the surface hides the control instead. */
  async function setVisibility(type: HubItemType, id: string, visibility: ItemVisibility) {
    const set =
      type === "Idea"
        ? provider.ideas.setIdeaVisibility?.bind(provider.ideas)
        : provider.solutions.setSolutionVisibility?.bind(provider.solutions);
    if (!set) throw new Error("This backend cannot change visibility.");
    return set(id, visibility);
  }
}
