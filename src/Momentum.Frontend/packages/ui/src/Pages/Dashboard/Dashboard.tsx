import { useEffect, useState } from "react";
import type React from "react";
import styles from "./Dashboard.module.scss";
import type { Insights } from "../../types";
import { useApi } from "../../Hooks/useApi";
import { errorText, initials, personName } from "../../utils";
import { PageHeader } from "../../Components/PageHeader/PageHeader";
import { Empty, Pending } from "../../Components/Empty/Empty";

/**
 * How the programme is actually going.
 *
 * THE RULE THIS PAGE IS BUILT AROUND: every number has to survive the question
 * "where did it come from". Each tile carries its own provenance line, and anything
 * the backend could not measure renders as "no data" — never as a confident zero,
 * which is exactly what let a rollup table nothing had ever written to go unnoticed.
 *
 * On charts: the bars are one hue, because every bar in a chart here is the same
 * measure at a different magnitude — length carries the value and nothing is encoded
 * by colour, so there is no categorical palette to get wrong and no legend to need.
 * Colour appears in exactly one other place, on the stale-approval nudge, where it is
 * a status and ships with an icon and a sentence rather than on its own.
 */
export function Dashboard(): React.ReactElement {
  const api = useApi();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setInsights(await api<Insights>("/api/insights"));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <PageHeader
          title="How this is going"
          detail="Every figure below is computed from the records themselves, and says which ones."
        />
        <button className={styles.refresh} onClick={() => void load()} disabled={busy}>
          {busy ? "Reading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className={styles.notice} role="alert">
          {error}
        </div>
      )}

      {insights ? (
        <DashboardBody insights={insights} />
      ) : busy ? (
        // "Nothing to show" and "still reading" are different claims, and this page
        // is entirely about not making a claim the data does not support.
        <Pending text="Reading the records…" />
      ) : (
        <Empty text="This backend does not compute programme figures." />
      )}
    </div>
  );
}

function DashboardBody({ insights }: { insights: Insights }): React.ReactElement {
  const { ideas, approval, voters, engagement30d, solutions, funnel, contributors } = insights;
  const contributorPeak = Math.max(1, ...contributors.map((person) => person.total));

  const submittedDelta = ideas.submitted30d - ideas.submittedPrior30d;
  const breadth =
    voters.population && voters.population > 0
      ? Math.round((voters.distinct / voters.population) * 100)
      : null;

  return (
    <>
      <section className={styles.tiles} aria-label="Headline figures">
        <Tile
          label="Ideas submitted"
          value={String(ideas.submitted30d)}
          support={
            ideas.submittedPrior30d === 0 && ideas.submitted30d === 0
              ? "None in either 30-day window"
              : `${submittedDelta >= 0 ? "+" : "−"}${Math.abs(submittedDelta)} on prior 30d`
          }
          source={`Last 30 days · ${ideas.total} on record in total`}
        />
        <Tile
          label="Median time in approval"
          value={approval.medianDays === null ? "—" : `${formatDays(approval.medianDays)}d`}
          support={
            approval.p90Days === null
              ? "Nothing decided yet"
              : `P90 · ${formatDays(approval.p90Days)}d`
          }
          /* The measurement, not just the number. The two hosts measure this
             differently — one has a decision record, the other reconstructs it — and
             a reader comparing them deserves to know which they are looking at. */
          source={`${approval.source} · ${approval.sampleSize} decided`}
        />
        <Tile
          label="Voter breadth"
          value={breadth === null ? String(voters.distinct) : `${breadth}%`}
          support={
            breadth === null
              ? `${voters.distinct} distinct voter${voters.distinct === 1 ? "" : "s"}`
              : `${voters.distinct} of ${voters.population} people`
          }
          source={
            voters.populationSource
              ? `Denominator: ${voters.populationSource}`
              : "No user directory on this backend, so there is no denominator"
          }
        />
        <Tile
          label="Solutions adopted"
          value={`${solutions.adopted}/${solutions.total}`}
          support="≥1 adoption event"
          source="Adoption rows, all time"
        />
      </section>

      {/* Two columns, two panels each. The left pair is about the work; the right pair
          is about the people engaging with it. */}
      <div className={styles.split}>
        <div className={styles.stack}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Lifecycle</h2>
          <p className={styles.panelHint}>Current inventory by state</p>
          <BarSet
            rows={funnel.map((stage) => ({
              label: stage.label,
              value: stage.value,
              detail: stage.detail,
            }))}
          />
          {approval.staleCount > 0 && (
            /*
             * The missing triage worker, made visible.
             *
             * Nothing performs triage behind this app, so an idea can sit in the
             * queue indefinitely and no process will ever say so. This tile is
             * deliberately the nudge that the worker would have been — a status, with
             * an icon and a sentence, so it does not depend on its colour to read.
             */
            <p className={styles.nudge}>
              <span aria-hidden="true">⚠</span>
              <span>
                <strong>
                  {approval.staleCount} idea{approval.staleCount === 1 ? " has" : "s have"} sat in
                  approval past {approval.staleAfterDays} days.
                </strong>{" "}
                There is no triage worker to nudge them, so this tile is the nudge.
              </span>
            </p>
          )}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Who is contributing</h2>
          <p className={styles.panelHint}>People with recorded activity, ranked by volume</p>
          {contributors.length === 0 ? (
            <p className={styles.absent}>Nobody has done anything recorded yet.</p>
          ) : (
            <ul className={styles.people}>
              {contributors.map((person) => (
                <PersonRow key={person.id} person={person} peak={contributorPeak} />
              ))}
            </ul>
          )}
          <p className={styles.source}>
            Counted from the audit trail: ideas and solutions shared, upvotes, comments and
            adoptions. Decisions and visibility changes are administration, not
            contribution, and are deliberately not counted.
          </p>
        </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Engagement mix</h2>
            <p className={styles.panelHint}>Rows recorded in the last 30 days</p>
            <BarSet
              rows={[
                { label: "Votes", value: engagement30d.votes },
                { label: "Comments", value: engagement30d.comments },
                {
                  label: "Participation",
                  value: engagement30d.participation,
                  // Not zero. Nothing in the app creates one of these, so a zero
                  // would report an unbuilt feature as an unpopular one.
                  absent: "no UI yet",
                },
                { label: "Adoptions", value: engagement30d.adoptions },
              ]}
            />
            {/* The caveat holds whichever way the number lands. Zero renders as
                "no UI yet" above; a non-zero count is real, but it cannot have come
                from anyone using this app, and a reader comparing it against votes
                would otherwise take it for demand. */}
            <p className={styles.source}>
              Nothing in this app creates a participation row — the routes exist and no
              surface calls them, so any count here arrived through the API.
            </p>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Concentration</h2>
            <p className={styles.panelHint}>Share of votes cast by the top 10 people</p>
            {voters.topTenShare === null ? (
              <p className={styles.absent}>No votes have been cast, so there is no share to take.</p>
            ) : (
              <>
                <div className={styles.hero}>{Math.round(voters.topTenShare * 100)}%</div>
                <div
                  className={styles.heroTrack}
                  role="img"
                  aria-label={`${Math.round(voters.topTenShare * 100)} percent of ${voters.totalVotes} votes`}
                >
                  <span
                    className={styles.heroFill}
                    style={{ width: `${Math.round(voters.topTenShare * 100)}%` }}
                  />
                </div>
                <p className={styles.panelNote}>
                  High concentration means the signal is a clique, not the org.
                </p>
                <p className={styles.source}>
                  {voters.totalVotes} vote{voters.totalVotes === 1 ? "" : "s"} from{" "}
                  {voters.distinct} {voters.distinct === 1 ? "person" : "people"}
                </p>
              </>
            )}
          </section>
        </div>
      </div>

      <p className={styles.stamp}>Read {new Date(insights.generatedAt).toLocaleString()}</p>
    </>
  );
}

function Tile({
  label,
  value,
  support,
  source,
}: {
  label: string;
  value: string;
  support: string;
  /** Where the number came from. Not optional — that is the whole point of the page. */
  source: string;
}): React.ReactElement {
  return (
    <article className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileSupport}>{support}</span>
      <span className={styles.source}>{source}</span>
    </article>
  );
}

/**
 * One contributor.
 *
 * A named row with a ranked bar, not a pie and not a leaderboard of avatars: the
 * question is "who is carrying this", which is magnitude by identity, and the identity
 * has to be a name a reader recognises. The breakdown is text rather than a stacked
 * bar — four segments across eight rows would need a categorical palette to tell
 * ideas from votes, and the numbers say it more precisely in less space.
 */
function PersonRow({
  person,
  peak,
}: {
  person: Insights["contributors"][number];
  peak: number;
}): React.ReactElement {
  // The backend names the person where its key is a GUID; where the key is already an
  // identity, the shared helper derives the name from it.
  const name = person.name?.trim() || personName(person.id);
  const parts = [
    person.ideas > 0 && `${person.ideas} shared`,
    person.votes > 0 && `${person.votes} upvote${person.votes === 1 ? "" : "s"}`,
    person.comments > 0 && `${person.comments} comment${person.comments === 1 ? "" : "s"}`,
    person.adoptions > 0 && `${person.adoptions} adoption${person.adoptions === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];

  return (
    <li className={styles.person}>
      <span className={styles.personAvatar} aria-hidden="true">
        {initials(name)}
      </span>
      <span className={styles.personMain}>
        <span className={styles.personName}>{name}</span>
        <span className={styles.personTrack}>
          <span
            className={styles.personFill}
            style={{ width: `${Math.round((person.total / peak) * 100)}%` }}
          />
        </span>
        <span className={styles.personBreakdown}>{parts.join(" · ")}</span>
      </span>
      <span className={styles.personTotal}>{person.total}</span>
    </li>
  );
}

interface BarRow {
  label: string;
  /** Null when the backend could not measure it — rendered as `absent`, not as 0. */
  value: number | null;
  detail?: string;
  absent?: string;
}

/**
 * Horizontal bars, one hue.
 *
 * Every row is the same measure at a different magnitude, so length carries the
 * value and colour carries nothing — which is why there is no legend and no
 * categorical palette. Each bar is scaled against the largest row rather than a
 * fixed axis, and labelled with its own value, so the bar is a comparison aid and
 * the number is the fact.
 */
function BarSet({ rows }: { rows: BarRow[] }): React.ReactElement {
  const peak = Math.max(1, ...rows.map((row) => row.value ?? 0));
  return (
    <ul className={styles.bars}>
      {rows.map((row) => (
        <li key={row.label} className={styles.bar}>
          <span className={styles.barLabel}>{row.label}</span>
          <span className={styles.barTrack} title={row.detail}>
            {row.value !== null && (
              <span
                className={styles.barFill}
                style={{ width: `${Math.round((row.value / peak) * 100)}%` }}
              />
            )}
          </span>
          <span className={row.value === null ? styles.barAbsent : styles.barValue}>
            {row.value === null ? (row.absent ?? "no data") : row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "11" rather than "11.0", but "1.5" when half a day actually matters. */
function formatDays(days: number): string {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}
