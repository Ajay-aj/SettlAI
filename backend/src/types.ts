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
  filePath: string;
  status: ExpenseStatus;
  claimId: string | null;
  createdAt: string;
  updatedAt: string;
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

export type UserRole = "user" | "admin";

export type AuthUser = {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
};
