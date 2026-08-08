import { AppError } from "@innovation-backlog/logic";
import type { HubItemType } from "@innovation-backlog/logic";

import { Cycai_activitiesService } from "../../generated/services/Cycai_activitiesService.js";
import { Cycai_activitiescycai_actortype } from "../../generated/models/Cycai_activitiesModel.js";
import { Cycai_activitiescycai_subjecttype } from "../../generated/models/Cycai_activitiesModel.js";

import type { ActivityWriter } from "../activity-recorder.js";
import { unwrap } from "../errors.js";
import { guid } from "./paging.js";

/**
 * The write half of the activity feed.
 *
 * Reading lived in `collaboration.ts` from the start; this is what was missing.
 * Separate module because the recorder that drives it is provider-wide rather than
 * a collaboration concern — activity is appended for votes and decisions too.
 */

type ChoiceMap = Record<number, string>;

const SUBJECT_TYPE = Cycai_activitiescycai_subjecttype as unknown as ChoiceMap;
const ACTOR_TYPE = Cycai_activitiescycai_actortype as unknown as ChoiceMap;

function valueOf(map: ChoiceMap, name: string): number {
  const entry = Object.entries(map).find(([, label]) => label === name);
  if (!entry) throw new AppError(`Unknown choice '${name}'`, { category: "validation" });
  return Number(entry[0]);
}

export interface ActivityWriterOptions {
  /** The signed-in user's Dataverse systemuser id, or null before one resolves. */
  currentUserId: () => Promise<string | null>;
}

export function createActivityWriter(options: ActivityWriterOptions): ActivityWriter {
  return {
    async record(entry) {
      const actorId = await options.currentUserId();

      // cycai_name is the primary column and is required. The action key plus the
      // subject is enough to identify a row in a table nobody reads by name.
      const record: Record<string, unknown> = {
        cycai_name: `${entry.action} ${entry.subjectId}`.slice(0, 200),
        cycai_action: entry.action,
        cycai_subjectid: Number(entry.subjectId),
        cycai_subjectkey: `${entry.subjectType}:${entry.subjectId}`,
        cycai_subjecttype: valueOf(SUBJECT_TYPE, entry.subjectType),
        cycai_actortype: valueOf(ACTOR_TYPE, "User"),
        cycai_occurredon: new Date().toISOString(),
      };

      // Stored, but never the phrasing: feeds render from the action key, so a
      // summary is evidence rather than display text. Trimmed because a comment
      // body can be arbitrarily long and this column is not the place for it.
      if (entry.summary) record.cycai_summary = entry.summary.slice(0, 400);
      if (actorId) record["cycai_actorid@odata.bind"] = `/systemusers(${guid(actorId)})`;

      unwrap(await Cycai_activitiesService.create(record as never), "record activity");
    },
  };
}
