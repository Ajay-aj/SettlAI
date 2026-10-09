export const NATURES = ["food", "cab", "travel", "lodging", "other"] as const;
export type ExpenseNature = (typeof NATURES)[number];

export type ExpenseStatus = "needs_review" | "confirmed" | "claimed";
export type StoredClaimStatus = "draft" | "submitted" | "approved" | "rejected";
export type DisplayStatus = StoredClaimStatus | "partially_paid" | "paid";

export type Expense = {
  id: string;
  userId: string;
  date: string | null;
  vendorName: string;
  billerName: string;
  amount: number | null;
  currency: string;
  nature: ExpenseNature;
  mealCount: number | null;
  isGroup: boolean;
  groupMembers: string[];
  aiSuggestedGroup: boolean;
  summary: string;
  extractError: string | null;
  fileName: string;
  mimeType: string;
  status: ExpenseStatus;
  claimId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillDraft = {
  id: string;
  date: string;
  vendorName: string;
  billerName: string;
  amount: string;
  currency: string;
  nature: ExpenseNature;
  mealCount: string;
  isGroup: boolean;
  groupMembers: string[];
  aiSuggestedGroup: boolean;
  summary: string;
  extractError: string | null;
  fileName: string;
  mimeType: string;
  status: ExpenseStatus;
  localUri?: string;
};

export type Payment = {
  id: string;
  claimId: string;
  userId: string;
  amount: number;
  paidOn: string;
  reference: string;
  note: string;
  createdAt: string;
};

export type Claim = {
  id: string;
  userId: string;
  title: string;
  status: StoredClaimStatus;
  submitterEmail: string;
  createdAt: string;
  submittedAt: string | null;
  updatedAt: string;
  total: number;
  paid: number;
  outstanding: number;
  expenseCount: number;
  displayStatus: DisplayStatus;
};

export type Summary = {
  needsReview: number;
  unclaimedCount: number;
  unclaimedAmount: number;
  awaitingCount: number;
  awaitingAmount: number;
};

export const NATURE_LABELS: Record<ExpenseNature, string> = {
  food: "Food",
  cab: "Cab",
  travel: "Travel",
  lodging: "Stay",
  other: "Other",
};

export const STATUS_LABELS: Record<DisplayStatus | ExpenseStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  partially_paid: "Part paid",
  paid: "Paid",
  needs_review: "To review",
  confirmed: "Ready",
  claimed: "On a claim",
};

export function toDraft(expense: Expense, localUri?: string): BillDraft {
  return {
    id: expense.id,
    date: expense.date ?? "",
    vendorName: expense.vendorName,
    billerName: expense.billerName,
    amount: expense.amount == null ? "" : String(expense.amount),
    currency: expense.currency || "INR",
    nature: expense.nature,
    mealCount: String(expense.mealCount ?? 1),
    isGroup: expense.isGroup,
    groupMembers: expense.groupMembers,
    aiSuggestedGroup: expense.aiSuggestedGroup,
    summary: expense.summary,
    extractError: expense.extractError,
    fileName: expense.fileName,
    mimeType: expense.mimeType,
    status: expense.status,
    localUri,
  };
}
