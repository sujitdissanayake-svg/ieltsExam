import type { AssignmentStatus } from "@/lib/student";

export function formatAssignmentStatus(status: AssignmentStatus, scoreBand?: number): string {
  if (status === "Graded" && typeof scoreBand === "number") {
    return `Graded · Band ${scoreBand.toFixed(1)}`;
  }
  return status;
}
