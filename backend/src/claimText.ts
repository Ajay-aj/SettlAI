import { formatLongDate, formatMoney } from "./format";
import type { DisplayStatus, Expense, Payment } from "./types";

type ClaimTextSource = {
  title: string;
  submitterEmail: string;
  displayStatus: DisplayStatus;
  total: number;
  paid: number;
  outstanding: number;
};

const NATURE_LABELS: Record<Expense["nature"], string> = {
  food: "Food",
  cab: "Cab",
  travel: "Travel",
  lodging: "Stay",
  other: "Other",
};

export function renderClaimText(
  claim: ClaimTextSource,
  expenses: Expense[],
  payments: Payment[],
): string {
  const lines = [
    "Reimbursement claim",
    claim.title,
    `From: ${claim.submitterEmail}`,
    `Status: ${claim.displayStatus.replaceAll("_", " ")}`,
    "",
  ];

  expenses.forEach((expense, index) => {
    lines.push(
      `${index + 1}. ${expense.date ? formatLongDate(expense.date) : "No date"}  ${expense.vendorName || "Unknown vendor"}`,
    );
    const biller = expense.billerName ? ` · Billed to ${expense.billerName}` : "";
    lines.push(
      `   ${NATURE_LABELS[expense.nature]} · ${formatMoney(expense.amount ?? 0, expense.currency)}${biller}`,
    );
    if (expense.isGroup) {
      lines.push(
        `   Group: ${expense.groupMembers.length ? expense.groupMembers.join(", ") : "yes"}`,
      );
    }
  });

  lines.push("", `Total ${formatMoney(claim.total)}`, `Paid ${formatMoney(claim.paid)}`, `Outstanding ${formatMoney(claim.outstanding)}`);

  if (payments.length) {
    lines.push("", "Payments");
    for (const payment of payments) {
      const reference = payment.reference ? ` · ${payment.reference}` : "";
      lines.push(`- ${formatLongDate(payment.paidOn)}  ${formatMoney(payment.amount)}${reference}`);
    }
  }

  return lines.join("\n");
}
