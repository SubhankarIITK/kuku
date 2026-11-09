import type { Promo, Review } from "../../backend/src/types";
export type Result = {
  runId: string;
  promos: Promo[];
  reviews: Review[];
  manifest: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
};
