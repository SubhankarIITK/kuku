import React from "react";
import { ArrowUpRight, Check } from "lucide-react";
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
  return (
    <article
      className="promo-row"
      aria-label={`Rank ${p.rank}, episode ${segment.episode}`}
    >
      <div className="cut-meta">
        <div className="cut-identity">
          <span className="rank">{String(p.rank).padStart(2, "0")}</span>
          <strong>Episode {String(segment.episode).padStart(2, "0")}</strong>
        </div>
        <div className="source-range">
          <time>{time(segment.startMs)}</time>
          <span>to</span>
          <time>{time(segment.endMs)}</time>
        </div>
        <div className="cut-caption">
          <span>{(p.durationMs / 1000).toFixed(1)} sec</span>
          <span>
            {p.evaluation.source === "llm" ? "AI scored" : "Local shortlist"}
          </span>
        </div>
      </div>
      <div className="cut-story">
        <div className="evidence-block">
          <h3>Opening hook</h3>
          <p>{p.evaluation.evidence.hook.description}</p>
        </div>
        <div className="evidence-block">
          <h3>Ending cliffhanger</h3>
          <p>{p.evaluation.evidence.cliffhanger.description}</p>
        </div>
      </div>
      <div className="cut-decision">
        <div className="row-score">
          <strong>{p.score.toFixed(1)}</strong>
          <span>/ 10</span>
        </div>
        <button
          className="inspect-button"
          aria-label={`Inspect episode ${segment.episode}, cut ${p.rank}`}
          onClick={onOpen}
        >
          Inspect cut <ArrowUpRight size={15} />
        </button>
        <span className={"review-state " + (reviewed ? "done" : "")}>
          {reviewed && <Check size={12} />}{" "}
          {reviewed ? "Reviewed" : "Not reviewed"}
        </span>
      </div>
    </article>
  );
}
