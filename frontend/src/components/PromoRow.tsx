import React from "react";
import { ArrowUpRight, Check, FileText, Film } from "lucide-react";
import type { Promo } from "../../../backend/src/types";
import { time } from "../presentation";

export default function PromoRow({
  promo: p,
  reviewed,
  onOpen,
}: {
  promo: Promo;
  reviewed: boolean;
  onOpen: () => void;
}) {
  const segment = p.segments[0];
  const evidenceCount = new Set(
    Object.values(p.evaluation.evidence).flatMap((e) => e.evidenceEventIds),
  ).size;
  return (
    <article
      className="promo-row"
      aria-label={`Rank ${p.rank}, episode ${segment.episode}`}
    >
      <span className="rank">{String(p.rank).padStart(2, "0")}</span>
      <div className="cut-summary">
        <div className="episode-stamp" aria-hidden="true">
          <Film size={17} />
          <span>{String(segment.episode).padStart(2, "0")}</span>
        </div>
        <div className="cut-summary-copy">
          <button
            className="row-title"
            onClick={onOpen}
            title={p.evaluation.reason}
          >
            {p.evaluation.reason}
          </button>
          <span className="row-caption">
            Episode {String(segment.episode).padStart(2, "0")} /{" "}
            {p.evaluation.source === "llm"
              ? "AI evaluation"
              : "Deterministic shortlist"}
          </span>
        </div>
      </div>
      <div className="source-range" aria-label="Source range">
        <time>{time(segment.startMs)}</time>
        <span>to</span>
        <time>{time(segment.endMs)}</time>
      </div>
      <span className="row-duration" aria-label="Duration">
        {(p.durationMs / 1000).toFixed(1)}s
      </span>
      <div
        className="row-score"
        aria-label={`Score ${p.score.toFixed(1)} out of 10`}
      >
        <strong>{p.score.toFixed(1)}</strong>
        <span>/10</span>
      </div>
      <button
        className="evidence-count"
        aria-label={`Inspect ${evidenceCount} cited evidence events`}
        onClick={onOpen}
      >
        <FileText size={15} />
        {evidenceCount}
      </button>
      <span className={"review-state " + (reviewed ? "done" : "")}>
        {reviewed && <Check size={13} />}{" "}
        {reviewed ? "Reviewed" : "Not reviewed"}
      </span>
      <button
        className="inspect-button"
        aria-label={`Inspect episode ${segment.episode}, cut ${p.rank}`}
        onClick={onOpen}
      >
        <ArrowUpRight size={18} />
      </button>
    </article>
  );
}
