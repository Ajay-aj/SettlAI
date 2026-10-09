import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRoute, type RouteProp } from "@react-navigation/native";
import {
  claimText,
  getClaim,
  logPayment,
  renameClaim,
  setClaimStatus,
  submitClaim,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import { Button, Field, Notice, Pill } from "../components/ui";
import { formatLongDate, formatMoney, todayISO } from "../format";
import type { AppStackParamList } from "../navigation/types";
import { theme } from "../theme";
import { NATURE_LABELS, STATUS_LABELS, type Claim, type Expense, type Payment } from "../types";

export function ClaimDetailScreen() {
  const route = useRoute<RouteProp<AppStackParamList, "Claim">>();
  const auth = useAuth();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await getClaim(route.params.claimId);
      setClaim(detail.claim);
      setExpenses(detail.expenses);
      setPayments(detail.payments);
      setTitle(detail.claim.title);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this claim.");
    }
  }, [route.params.claimId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function shareClaim() {
    try {
      const message = await claimText(route.params.claimId);
      await Share.share({ message });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share this claim.");
    }
  }

  if (!claim && !error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loading}>Loading claim…</Text>
      </View>
    );
  }

  const progress = claim && claim.total > 0 ? Math.min(100, (claim.paid / claim.total) * 100) : 0;
  const canPay = Boolean(claim && auth.isAdmin && claim.status !== "draft" && claim.status !== "rejected");
  const ownsClaim = claim?.submitterEmail.toLowerCase() === auth.email.toLowerCase();

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      {error ? <Notice>{error}</Notice> : null}
      {claim ? (
        <>
          {ownsClaim && claim.status === "draft" ? (
            <Field label="Title" onChangeText={setTitle} value={title} />
          ) : (
            <Text style={styles.title}>{claim.title}</Text>
          )}
          <View style={styles.statusRow}>
            <Pill label={STATUS_LABELS[claim.displayStatus]} tone={tone(claim.displayStatus)} />
            <Text style={styles.email}>{claim.submitterEmail}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.total}>
            {formatMoney(claim.paid)} paid · {formatMoney(claim.outstanding)} outstanding
          </Text>

          <Text style={styles.section}>Bills</Text>
          {expenses.map((expense) => (
            <View key={expense.id} style={styles.line}>
              <View style={styles.lineMain}>
                <Text style={styles.vendor}>{expense.vendorName}</Text>
                <Text style={styles.meta}>
                  {expense.date ? formatLongDate(expense.date) : "No date"} · {NATURE_LABELS[expense.nature]}
                  {expense.isGroup ? ` · ${expense.groupMembers.join(", ") || "Group"}` : ""}
                </Text>
              </View>
              <Text style={styles.amount}>{formatMoney(expense.amount ?? 0, expense.currency)}</Text>
            </View>
          ))}

          <Text style={styles.section}>Payments</Text>
          {payments.length === 0 ? <Text style={styles.meta}>Nothing logged yet.</Text> : null}
          {payments.map((payment) => (
            <View key={payment.id} style={styles.line}>
              <View style={styles.lineMain}>
                <Text style={styles.vendor}>{formatLongDate(payment.paidOn)}</Text>
                <Text style={styles.meta}>{payment.reference || "No reference"}</Text>
              </View>
              <Text style={styles.amount}>{formatMoney(payment.amount)}</Text>
            </View>
          ))}

          {showPayment && canPay ? (
            <View style={styles.payment}>
              <Field
                keyboardType="decimal-pad"
                label="Amount received"
                onChangeText={setAmount}
                value={amount}
              />
              <Field label="Date" onChangeText={setPaidOn} value={paidOn} />
              <Field label="Reference" onChangeText={setReference} placeholder="UPI or bank reference" value={reference} />
              <Button
                disabled={busy}
                label="Save payment"
                onPress={() =>
                  void run(async () => {
                    await logPayment(claim.id, { amount: Number(amount), paidOn, reference });
                    setAmount("");
                    setReference("");
                    setShowPayment(false);
                  })
                }
              />
            </View>
          ) : null}

          <View style={styles.actions}>
            {ownsClaim && claim.status === "draft" && title.trim() !== claim.title ? (
              <Button disabled={busy} label="Save title" onPress={() => void run(async () => { await renameClaim(claim.id, title.trim()); })} tone="secondary" />
            ) : null}
            {ownsClaim && claim.status === "draft" ? (
              <Button disabled={busy} label="Submit claim" onPress={() => void run(async () => { await submitClaim(claim.id); })} />
            ) : null}
            {auth.isAdmin && claim.status === "submitted" ? (
              <Button disabled={busy} label="Mark approved" onPress={() => void run(async () => { await setClaimStatus(claim.id, "approved"); })} tone="secondary" />
            ) : null}
            {canPay && !showPayment ? (
              <Button disabled={busy} label="Log payment received" onPress={() => setShowPayment(true)} />
            ) : null}
            {auth.isAdmin && (claim.status === "submitted" || claim.status === "approved") && claim.paid === 0 ? (
              <Pressable
                onPress={() =>
                  Alert.alert("Reject this claim?", "You can reopen it later if nothing has been paid.", [
                    { text: "Keep", style: "cancel" },
                    { text: "Reject", style: "destructive", onPress: () => void run(async () => { await setClaimStatus(claim.id, "rejected"); }) },
                  ])
                }
              >
                <Text style={styles.reject}>Reject claim</Text>
              </Pressable>
            ) : null}
            {ownsClaim && claim.status === "rejected" ? (
              <Button disabled={busy} label="Reopen as draft" onPress={() => void run(async () => { await setClaimStatus(claim.id, "draft"); })} tone="secondary" />
            ) : null}
            <Button label="Share claim" onPress={() => void shareClaim()} tone="secondary" />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function tone(status: Claim["displayStatus"]): "neutral" | "green" | "amber" | "danger" {
  if (status === "paid" || status === "approved") return "green";
  if (status === "rejected") return "danger";
  if (status === "partially_paid" || status === "submitted") return "amber";
  return "neutral";
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.bg },
  content: { gap: 12, padding: 20, paddingBottom: 40, width: "100%", maxWidth: 760, alignSelf: "center" },
  loading: { color: theme.muted, padding: 20 },
  title: { color: theme.ink, fontSize: 24, fontWeight: "800" },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  email: { color: theme.muted, fontSize: 12 },
  track: { backgroundColor: "#EFEBE4", borderRadius: 999, height: 8, overflow: "hidden" },
  fill: { backgroundColor: theme.green, height: 8 },
  total: { color: theme.ink, fontSize: 15, fontWeight: "700" },
  section: { color: theme.ink, fontSize: 18, fontWeight: "800", marginTop: 8 },
  line: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 12, padding: 12 },
  lineMain: { flex: 1, gap: 3 },
  vendor: { color: theme.ink, fontSize: 15, fontWeight: "700" },
  meta: { color: theme.muted, fontSize: 13 },
  amount: { color: theme.ink, fontSize: 15, fontWeight: "800" },
  payment: { gap: 10 },
  actions: { gap: 10, marginTop: 8 },
  reject: { color: theme.danger, fontWeight: "700", textAlign: "center" },
});
