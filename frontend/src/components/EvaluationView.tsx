import React from "react";
import { ChartNoAxesCombined, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Promo, Review } from "../../../backend/src/types";
import type { Result } from "../view-types";
export default function EvaluationView({
  data,
  result,
  onOpen,
}: {
  data: {
    metrics: Record<string, unknown>;
    baseline: Promo[];
    failures: Record<string, unknown>[];
  } | null;
  result: Result | null;
  onOpen: (p: Promo) => void;
}) {
  if (!data)
    return (
      <div className="empty">
        <ChartNoAxesCombined size={30} />
        <h3>No run to evaluate yet</h3>
        <p>Run an analysis to inspect measured results.</p>
      </div>
    );
  const m = data.metrics;
  return (
    <>
      <div className="notice">
        <ShieldCheck size={21} />
        <div>
          <strong>
            Validity is measurable. Editorial quality needs review.
          </strong>
          <p>
            {String(m.aiComparison)} No improvement over the baseline is
            claimed.
          </p>
        </div>
      </div>
      <div className="evaluation-grid">
        <section className="panel">
          <h2>Measured comparison</h2>
          <div
            className="table-scroll"
            role="region"
            aria-label="Measured baseline comparison"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Structured pipeline</th>
                  <th>Direct LLM</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Suggestions before ranking</td>
                  <td>{String(m.advancedSuggestions)} (all episodes)</td>
                  <td>
                    {m.baselineSuggestions
                      ? String(m.baselineSuggestions) + " (sample)"
                      : "Not run"}
                  </td>
                </tr>
                <tr>
                  <td>Invalid suggestions</td>
                  <td>{String(m.advancedInvalid)}</td>
                  <td>
                    {m.baselineSuggestions ? String(m.baselineInvalid) : "—"}
                  </td>
                </tr>
                <tr>
                  <td>Timestamp / evidence validity</td>
                  <td>
                    {m.advancedValidityRate === null
                      ? "—"
                      : `${(Number(m.advancedValidityRate) * 100).toFixed(1)}%`}
                  </td>
                  <td>
                    {m.baselineValidityRate === null
                      ? "—"
                      : `${(Number(m.baselineValidityRate) * 100).toFixed(1)}%`}
                  </td>
                </tr>
                <tr>
                  <td>Comparison sample episodes</td>
                  <td colSpan={2}>
                    {Array.isArray(m.baselineSampleEpisodes)
                      ? m.baselineSampleEpisodes.join(", ")
                      : "Not recorded"}
                  </td>
                </tr>
                <tr>
                  <td>Human reviewed</td>
                  <td>{result?.reviews.length ?? 0}</td>
                  <td>Not collected</td>
                </tr>
                <tr>
                  <td>Quality improvement</td>
                  <td colSpan={2}>Unmeasured — human comparison pending</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="help">
            Advanced results include validation and bounded repair. Baseline
            invalidity is measured before rejection. Comparison uses only the
            listed sample episodes, not all advanced suggestions; these measure
            delivered validity, not equal-call efficiency.
          </p>
        </section>
        <section className="panel">
          <h2>Run telemetry</h2>
          <dl>
            <dt>Episodes attempted</dt>
            <dd>{String(m.episodesAttempted)}</dd>
            <dt>Elapsed time</dt>
            <dd>{(Number(m.elapsedMs) / 1000).toFixed(2)}s</dd>
            <dt>Candidate evaluations</dt>
            <dd>{String(m.evaluatedCandidates)}</dd>
            <dt>Model calls / retries</dt>
            <dd>
              {m.usage
                ? `${(m.usage as { calls: number }).calls} / ${(m.usage as { retries: number }).retries}`
                : "Not run"}
            </dd>
            <dt>Input / output tokens</dt>
            <dd>
              {m.usage
                ? `${(m.usage as { inputTokens: number }).inputTokens} / ${(m.usage as { outputTokens: number }).outputTokens}`
                : "Not available"}
            </dd>
          </dl>
          <p className="help">
            Model self-confidence is uncalibrated. Human labels are stored
            separately from generated scores.
          </p>
        </section>
      </div>
      <section className="panel failure-panel">
        <h2>
          Selection risks & failures{" "}
          <span className="pill">{data.failures.length}</span>
        </h2>
        <p className="help">
          Actual run flags below. Heuristic flags indicate a possible weakness,
          not a confirmed human judgment.
        </p>
        {!data.failures.length && (
          <p>
            No automatic flags recorded. This does not prove editorial quality.
          </p>
        )}
        {data.failures.slice(0, 15).map((f, i) => (
          <div className="failure" key={i}>
            <TriangleAlert size={17} />
            <div>
              <strong>
                {String(f.stage)} ·{" "}
                {String(f.candidateId ?? `Episode ${f.episode}`)}
              </strong>
              <p>{String(f.error ?? f.whySelected ?? "Review required")}</p>
              {Array.isArray(f.whyWeak) && <p>{f.whyWeak.join(" ")}</p>}
              {f.improvement !== undefined && (
                <small>{String(f.improvement)}</small>
              )}
            </div>
            {result?.promos.some((p) => p.id === f.candidateId) && (
              <button
                className="button"
                onClick={() =>
                  onOpen(result.promos.find((p) => p.id === f.candidateId)!)
                }
              >
                Inspect
              </button>
            )}
          </div>
        ))}
        {data.failures.length > 15 && (
          <p className="help">
            Showing the first 15 flags. The complete failure log is stored in
            the run output folder.
          </p>
        )}
      </section>
    </>
  );
}
