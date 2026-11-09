import React, { useEffect, useState, useRef } from "react";
import {
  X,
  Scissors,
  Check,
  ChevronDown,
  TriangleAlert,
  LoaderCircle,
} from "lucide-react";
import {
  criteria,
  type Promo,
  type Episode,
  type Review,
} from "../../../backend/src/types";
import { time, titles } from "../presentation";
export default function Detail({
  promo: p,
  episode: ep,
  review,
  onClose,
  onSave,
}: {
  promo: Promo;
  episode: Episode | null;
  review?: Review;
  onClose: () => void;
  onSave: (body: {
    ratings: Review["ratings"];
    label: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [view, setView] = useState<"evidence" | "review">("evidence"),
    [context, setContext] = useState(false),
    [ratings, setRatings] = useState<Review["ratings"]>(
      review?.ratings ?? {
        hook: 3,
        cliffhanger: 3,
        clarity: 3,
        boundaries: 3,
        usefulness: 3,
      },
    ),
    [label, setLabel] = useState(review?.label ?? "Needs boundary adjustment"),
    [notes, setNotes] = useState(review?.notes ?? ""),
    [saving, setSaving] = useState(false),
    [err, setErr] = useState("");
  const s = p.segments[0],
    dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input,select,textarea,summary",
        ) ?? [],
      );
    focusable()[0]?.focus();
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", fn);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", fn);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay" onClick={onClose}>
      <section
        ref={dialogRef}
        className="detail"
        role="dialog"
        aria-modal="true"
        aria-label="Promo detail"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-header">
          <div>
            <div className="eyebrow">
              PROMO #{p.rank} · EPISODE {s.episode}
            </div>
            <h2>Source & editorial review</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close promo detail"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="detail-cut">
          <Scissors size={18} />
          <strong>
            {time(s.startMs)} → {time(s.endMs)}
          </strong>
          <span>{(p.durationMs / 1000).toFixed(1)} seconds</span>
          <span className="score">
            {p.score.toFixed(1)}
            <small>/10</small>
          </span>
        </div>
        {ep && (
          <div className="timeline-wrap">
            <div className="timeline">
              {ep.events
                .filter((e) => e.type === "dialogue")
                .map((e) => (
                  <i
                    key={e.id}
                    style={{
                      left: `${(e.startMs / ep.durationMs) * 100}%`,
                      width: `${((e.endMs - e.startMs) / ep.durationMs) * 100}%`,
                    }}
                  />
                ))}
              <div
                className="selected-range"
                style={{
                  left: `${(s.startMs / ep.durationMs) * 100}%`,
                  width: `${((s.endMs - s.startMs) / ep.durationMs) * 100}%`,
                }}
              />
            </div>
            <div className="timeline-labels">
              <span>00:00</span>
              <span>Selected interval</span>
              <span>{time(ep.durationMs)}</span>
            </div>
          </div>
        )}
        <div className="detail-tabs">
          <button
            aria-pressed={view === "evidence"}
            className={view === "evidence" ? "active" : ""}
            onClick={() => setView("evidence")}
          >
            Evidence & boundaries
          </button>
          <button
            aria-pressed={view === "review"}
            className={view === "review" ? "active" : ""}
            onClick={() => setView("review")}
          >
            Editorial review {review && <Check size={14} />}
          </button>
        </div>
        <div className="detail-body">
          {view === "evidence" ? (
            <>
              <div className="source-banner">
                {p.evaluation.source === "heuristic"
                  ? "Heuristic scores · narrative quality unverified"
                  : "AI subjective scores · evidence validated"}{" "}
                · {p.evaluation.model}
              </div>
              <div className="score-bars">
                {criteria.map((k) => (
                  <div key={k}>
                    <span>{titles[k]}</span>
                    <div>
                      <i style={{ width: `${p.evaluation.scores[k] * 10}%` }} />
                    </div>
                    <b>{p.evaluation.scores[k].toFixed(1)}</b>
                  </div>
                ))}
              </div>
              <p>{p.evaluation.reason}</p>
              <div className="detail-evidence">
                <h3>Opening hook</h3>
                <p>{p.evaluation.evidence.hook.description}</p>
                <small>
                  {p.evaluation.evidence.hook.evidenceEventIds.join(" · ")}
                </small>
                <h3>Ending cliffhanger</h3>
                <p>{p.evaluation.evidence.cliffhanger.description}</p>
                <small>
                  {p.evaluation.evidence.cliffhanger.evidenceEventIds.join(
                    " · ",
                  )}
                </small>
              </div>
              <details className="weight-settings">
                <summary>
                  Evidence for all criteria <ChevronDown size={14} />
                </summary>
                {criteria.map((k) => (
                  <div key={k}>
                    <h4>{titles[k]}</h4>
                    <p>{p.evaluation.evidence[k].description}</p>
                    <small>
                      {p.evaluation.evidence[k].evidenceEventIds.join(" · ")}
                    </small>
                  </div>
                ))}
              </details>
              {p.boundaryComparison && (
                <div className="boundary">
                  <h3>Boundary comparison</h3>
                  <div>
                    <span>Original</span>
                    <code>
                      {time(p.boundaryComparison.original.segments[0].startMs)}{" "}
                      → {time(p.boundaryComparison.original.segments[0].endMs)}
                    </code>
                    <b>{p.boundaryComparison.originalScore.toFixed(2)}</b>
                  </div>
                  <div>
                    <span>Selected</span>
                    <code>
                      {time(s.startMs)} → {time(s.endMs)}
                    </code>
                    <b>{p.score.toFixed(2)}</b>
                  </div>
                  <p>{p.boundaryComparison.reason}</p>
                </div>
              )}
              <div className="warnings">
                <h3>Before you use this cut</h3>
                {[...p.warnings, ...p.evaluation.weaknesses].map((w, i) => (
                  <p key={i}>
                    <TriangleAlert size={13} />
                    {w}
                  </p>
                ))}
                {p.diversityPenalty > 0 && (
                  <p>
                    Display-order diversity deduction:{" "}
                    {p.diversityPenalty.toFixed(2)}. Raw score unchanged.
                  </p>
                )}
              </div>
              <div className="script-heading">
                <h3>Source timeline</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={context}
                    onChange={(e) => setContext(e.target.checked)}
                  />{" "}
                  Show surrounding context
                </label>
              </div>
              {!ep ? (
                <LoaderCircle className="spin" />
              ) : (
                <>
                  {context && (
                    <div className="context-note">
                      <b>Background metadata · not seen by the viewer</b>
                      <p>{ep.logline}</p>
                      <p>{ep.continuity}</p>
                    </div>
                  )}
                  {ep.events
                    .filter(
                      (e) =>
                        p.eventIds.includes(e.id) ||
                        (context && p.contextEventIds.includes(e.id)),
                    )
                    .map((e) => (
                      <div
                        className={
                          "script-event " +
                          (!p.eventIds.includes(e.id) ? "outside" : "")
                        }
                        key={e.id}
                      >
                        <div>
                          <code>
                            {time(e.startMs)} → {time(e.endMs)}
                          </code>
                          <span>
                            {p.eventIds.includes(e.id)
                              ? "IN CLIP"
                              : "OUTSIDE CLIP"}
                          </span>
                        </div>
                        <strong>{e.label}</strong>
                        <p>{e.text}</p>
                        <small>
                          {e.id} · {e.sourceFile.split("/").at(-1)} · lines{" "}
                          {e.sourceLineStart}–{e.sourceLineEnd}
                        </small>
                      </div>
                    ))}
                </>
              )}
            </>
          ) : (
            <>
              <p className="help">
                Rate the actual clip, using included content only. 1 = unusable,
                3 = needs work, 5 = ready to use. These values become human
                labels only when you save.
              </p>
              {(Object.keys(ratings) as (keyof Review["ratings"])[]).map(
                (k) => (
                  <div className="rating" key={k}>
                    <span>{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                    <div>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          aria-label={`${k} rating ${n}`}
                          aria-pressed={ratings[k] === n}
                          className={ratings[k] === n ? "active" : ""}
                          key={n}
                          onClick={() => setRatings({ ...ratings, [k]: n })}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ),
              )}
              <label className="field">
                Editorial decision
                <select
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                >
                  {[
                    "Good promo",
                    "Needs boundary adjustment",
                    "Lacks context",
                    "Weak hook",
                    "Weak cliffhanger",
                    "Invalid timestamp",
                    "Other failure",
                  ].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Review notes
                <textarea
                  maxLength={5000}
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What works? What would you change?"
                />
              </label>
              {err && <p className="error">{err}</p>}
              <button
                className="button primary wide"
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  setErr("");
                  void onSave({ ratings, label, notes })
                    .catch((e) => setErr(e.message))
                    .finally(() => setSaving(false));
                }}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                Save editorial review
              </button>
              {review && (
                <p className="help">
                  Last saved {new Date(review.updatedAt).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
