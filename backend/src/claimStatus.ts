import type { DisplayStatus, StoredClaimStatus } from "./types";

export function displayStatus(
  status: StoredClaimStatus,
  total: number,
  paid: number,
): DisplayStatus {
  if (status === "draft" || status === "rejected") return status;
  if (total > 0 && paid > 0 && paid + 0.009 >= total) return "paid";
  if (paid > 0 && paid + 0.009 < total) return "partially_paid";
  return status;
}

export function outstandingAmount(total: number, paid: number): number {
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}
