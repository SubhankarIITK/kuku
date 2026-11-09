import type { Scores } from "../../backend/src/types";
export const time = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}.${(ms % 1000).toString().padStart(3, "0")}`;
export const titles: Record<keyof Scores, string> = {
  hook: "Opening hook",
  cliffhanger: "Cliffhanger",
  standaloneClarity: "Standalone clarity",
  emotionalImpact: "Emotional impact",
  pacing: "Pacing",
};
