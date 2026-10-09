import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ApiError,
  confirmExpenses,
  createClaim,
  extractBills,
  listClaims,
  listExpenses,
  submitClaim,
  summary as loadSummary,
  type LocalFile,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import { issuesForBill, payloadForBill } from "../bills";
import { AddBillsSheet } from "../components/AddBillsSheet";
import { ADMIN_SUGGESTIONS, BillChat, EMPLOYEE_SUGGESTIONS, type ChatTurn } from "../components/BillChat";
import { parseChat } from "../chatIntent";
import { Notice } from "../components/ui";
import { formatMoney } from "../format";
import { captureBills, pickPdfs, pickPhotos } from "../importer";
import type { HomeNavigation } from "../navigation/types";
import { previewStore } from "../previewStore";
import { theme } from "../theme";
import { STATUS_LABELS, toDraft, type DisplayStatus, type Expense, type ExpenseStatus } from "../types";

const employeeHelp =
  "Ask for bills to review, ready bills, or claims in review, approved, or paid. Say send for approval when you want the ready bills submitted. You can also drop photos and PDFs here. Tap a result to open it.";

const adminHelp =
  "Ask for claims in review, submitted, approved, or paid. Tap a claim to approve it or log a payment.";

function welcomeTurn(isAdmin: boolean): ChatTurn {
  return { id: "welcome", kind: "note", text: isAdmin ? adminHelp : employeeHelp };
}

const submitAction = [{ label: "Send for approval", command: "Send for approval" }];

function expenseIntro(status: ExpenseStatus | "all", count: number): string {
  const label =
    status === "needs_review"
      ? "to review"
      : status === "confirmed"
        ? "ready to send"
        : status === "claimed"
          ? "already on a claim"
          : "in total";
  if (count === 0) return status === "all" ? "You don’t have any bills yet." : `You don’t have any bills ${label}.`;
  return `${count} ${count === 1 ? "bill" : "bills"} ${label}.`;
}

function claimIntro(status: DisplayStatus | "all" | "awaiting", count: number): string {
  const label =
    status === "all" ? "" : status === "awaiting" ? "still open" : STATUS_LABELS[status].toLowerCase();
  if (count === 0) return label ? `You don’t have any ${label} claims.` : "You don’t have any claims yet.";
  return `${count} ${label ? `${label} ` : ""}${count === 1 ? "claim" : "claims"}.`;
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>(() => [welcomeTurn(auth.isAdmin)]);
  const reading = useRef(false);

  const load = useCallback(async () => {
    try {
      await loadSummary();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your bills.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => void auth.signOut()} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      ),
    });
  }, [auth, navigation]);

  function reply(turn: ChatTurn) {
    setTurns((current) => [...current, turn]);
  }

  async function showExpenses(status: ExpenseStatus | "all") {
    const expenses = await listExpenses(status === "all" ? undefined : status);
    const canSend =
      !auth.isAdmin && expenses.some((expense) => expense.status === "needs_review" || expense.status === "confirmed");
    reply({
      id: `bills-${Date.now()}`,
      kind: "bills",
      intro: expenseIntro(status, expenses.length),
      expenses,
      actions: canSend ? submitAction : undefined,
    });
  }

  async function showClaims(status: DisplayStatus | "all" | "awaiting") {
    const claims = await listClaims();
    const shown =
      status === "all"
        ? claims
        : status === "awaiting"
          ? claims.filter((claim) => ["submitted", "approved", "partially_paid"].includes(claim.displayStatus))
          : claims.filter((claim) => claim.displayStatus === status);
    reply({
      id: `claims-${Date.now()}`,
      kind: "claims",
      intro: claimIntro(status, shown.length),
      claims: shown,
    });
  }

  async function sendForApproval() {
    const [review, ready] = await Promise.all([listExpenses("needs_review"), listExpenses("confirmed")]);
    const blocked: { expense: Expense; issues: string[] }[] = [];
    const payloads = [];
    for (const expense of review) {
      const draft = toDraft(expense);
      const issues = issuesForBill(draft);
      if (issues.length > 0) blocked.push({ expense, issues });
      else payloads.push(payloadForBill(draft));
    }

    let confirmed = ready;
    if (payloads.length > 0) {
      confirmed = [...ready, ...(await confirmExpenses(payloads))];
    }
    if (confirmed.length === 0) {
      const detail = blocked
        .map((item) => `${item.expense.vendorName || item.expense.fileName}: ${item.issues.join(" ")}`)
        .join("\n");
      reply({
        id: `submit-${Date.now()}`,
        kind: "note",
        text: detail
          ? `Nothing is ready to send yet.\n${detail}`
          : "Nothing is ready to send. Drop a bill, or ask for bills to review.",
      });
      return;
    }

    const claim = await createClaim(confirmed.map((expense) => expense.id));
    const submitted = await submitClaim(claim.id);
    const leftOut =
      blocked.length === 0
        ? ""
        : `\n${blocked.length} ${blocked.length === 1 ? "bill was" : "bills were"} left out because details are still missing.`;
    reply({
      id: `sent-${Date.now()}`,
      kind: "claims",
      intro: `Sent ${confirmed.length} ${confirmed.length === 1 ? "bill" : "bills"} for approval. ${submitted.title} is ${formatMoney(submitted.total)}.${leftOut}`,
      claims: [submitted],
    });
    if (blocked.length > 0) {
      reply({
        id: `blocked-${Date.now()}`,
        kind: "bills",
        intro: "These still need details before they can be sent.",
        expenses: blocked.map((item) => item.expense),
      });
    }
  }

  async function answer(text: string) {
    const intent = parseChat(text);
    if (auth.isAdmin && (intent.type === "submit" || intent.type === "expenses")) {
      reply({
        id: `admin-${Date.now()}`,
        kind: "note",
        text: "You approve claims and log payments. Ask for claims in review, submitted, or approved, then open one.",
      });
      return;
    }
    if (intent.type === "help") {
      reply({ id: `help-${Date.now()}`, kind: "note", text: auth.isAdmin ? adminHelp : employeeHelp });
      return;
    }
    if (intent.type === "expenses") {
      await showExpenses(intent.status);
      return;
    }
    if (intent.type === "claims") {
      await showClaims(intent.status);
      return;
    }
    await sendForApproval();
  }

  async function handleSend(text: string) {
    const clean = text.trim();
    if (!clean || reading.current) return;
    reading.current = true;
    reply({ id: `user-${Date.now()}`, kind: "user", text: clean });
    setBusy("Looking that up…");
    try {
      await answer(clean);
      setError(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong.";
      reply({ id: `err-${Date.now()}`, kind: "error", text: message });
    } finally {
      reading.current = false;
      setBusy(null);
      void load();
    }
  }

  async function publish(files: LocalFile[]) {
    if (auth.isAdmin) return;
    if (reading.current) return;
    if (files.length === 0) {
      reply({ id: `empty-${Date.now()}`, kind: "error", text: "Those files need to be photos or PDFs." });
      return;
    }
    reading.current = true;
    const batch = files.slice(0, 10);
    const extra = files.length - batch.length;
    const turnId = `${Date.now()}`;
    reply({
      id: `${turnId}-files`,
      kind: "files",
      files: batch.map((file) => ({ name: file.name, uri: file.uri, mimeType: file.mimeType })),
    });
    setBusy(`Reading ${batch.length} ${batch.length === 1 ? "bill" : "bills"}…`);
    try {
      const expenses = await extractBills(batch);
      batch.forEach((file, index) => {
        const expense = expenses[index];
        if (expense) previewStore.set(expense.id, file.uri);
      });
      const count = expenses.length;
      const intro =
        extra > 0
          ? `Created ${count} bills from the first 10 files. Say send for approval when you want them submitted.`
          : `Created ${count} ${count === 1 ? "bill" : "bills"}. Say send for approval when you want them submitted.`;
      reply({
        id: `${turnId}-bills`,
        kind: "bills",
        intro,
        expenses,
        actions: submitAction,
      });
      setError(null);
    } catch (err) {
      reply({
        id: `${turnId}-error`,
        kind: "error",
        text: err instanceof Error ? err.message : "Could not read those bills.",
      });
    } finally {
      reading.current = false;
      setBusy(null);
      void load();
    }
  }

  async function choose(source: "camera" | "photos" | "pdf") {
    setSheetOpen(false);
    const files = source === "camera" ? await captureBills() : source === "photos" ? await pickPhotos() : await pickPdfs();
    if (files.length === 0) return;
    await publish(files);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.hello}>{auth.isAdmin ? "Admin" : auth.name || auth.email}</Text>
        {error ? <Notice>{error}</Notice> : null}
      </View>
      <BillChat
        busy={busy}
        canAttach={!auth.isAdmin}
        onAttach={() => setSheetOpen(true)}
        onFiles={(files) => void publish(files)}
        onOpenClaim={(claimId) => navigation.navigate("Claim", { claimId })}
        onOpenExpense={(expenseId) => navigation.navigate("Review", { expenseIds: [expenseId] })}
        onSend={(text) => void handleSend(text)}
        suggestions={auth.isAdmin ? ADMIN_SUGGESTIONS : EMPLOYEE_SUGGESTIONS}
        turns={turns}
      />
      {auth.isAdmin ? null : (
        <AddBillsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onChoose={(source) => void choose(source)} />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.bg, flex: 1 },
  header: { gap: 8, paddingHorizontal: 16, paddingTop: 4, width: "100%", maxWidth: 760, alignSelf: "center" },
  hello: { color: theme.muted, fontSize: 13, fontWeight: "700" },
  signOut: { color: theme.green, fontWeight: "700", paddingRight: 4 },
});
