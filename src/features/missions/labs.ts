import type { WlaLab } from "@/types/database";

/**
 * The five Labs (Public Website Master §4).
 *
 * Designer Brief §32: "Do not make each Lab its own colour brand. The five
 * Labs belong to one WLA system." Hence labels only — no per-Lab palette.
 */
export const LAB_LABEL: Record<WlaLab, string> = {
  challenge: "Challenge Lab",
  decision: "Decision Lab",
  curiosity: "Curiosity Lab",
  wellbeing: "Wellbeing Lab",
  navigation: "Navigation Lab",
};
