import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createClaim, listExpenses } from "../api";
import { BillPreview } from "../components/BillPreview";
import { Button, Notice, Pill } from "../components/ui";
import { formatLongDate, formatMoney } from "../format";
import type { AppStackParamList, TabParamList } from "../navigation/types";
import { theme } from "../theme";
import { NATURE_LABELS, STATUS_LABELS, type Expense, type ExpenseStatus } from "../types";

const FILTERS: { id: "all" | ExpenseStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "To review" },
  { id: "confirmed", label: "Ready" },
  { id: "claimed", label: "On a claim" },
];

export function ExpensesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, "Expenses">>();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>(route.params?.filter ?? "all");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setExpenses(await listExpenses());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bills.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.filter) setFilter(route.params.filter);
      void load();
    }, [load, route.params?.filter]),
  );

  const visible = expenses.filter((expense) => filter === "all" || expense.status === filter);
  const selectedAmount = expenses
    .filter((expense) => selected.includes(expense.id))
    .reduce((sum, expense) => sum + (expense.amount ?? 0), 0);

  function toggle(expense: Expense) {
    if (expense.status !== "confirmed") return;
    setSelected((current) =>
      current.includes(expense.id) ? current.filter((id) => id !== expense.id) : [...current, expense.id],
    );
  }

  function open(expense: Expense) {
    if (expense.status === "needs_review" || expense.status === "confirmed") {
      navigation.navigate("Review", { expenseIds: [expense.id] });
      return;
    }
    if (expense.claimId) navigation.navigate("Claim", { claimId: expense.claimId });
  }

  async function makeClaim() {
    setBusy(true);
    try {
      const claim = await createClaim(selected);
      setSelected([]);
      navigation.navigate("Claim", { claimId: claim.id });
    } catch (err) {
      Alert.alert("Could not create the claim", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      >
        <View style={styles.filters}>
          {FILTERS.map((item) => (
            <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.filter, filter === item.id && styles.filterOn]}>
              <Text style={[styles.filterText, filter === item.id && styles.filterTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Notice>{error}</Notice> : null}
        {visible.length === 0 ? (
          <Text style={styles.empty}>No bills in this view. Add photos or PDFs from Home.</Text>
        ) : (
          visible.map((expense) => {
            const on = selected.includes(expense.id);
            return (
              <View key={expense.id} style={[styles.row, on && styles.rowOn]}>
                <BillPreview expenseId={expense.id} fileName={expense.fileName} mimeType={expense.mimeType} size="thumb" />
                <Pressable onPress={() => open(expense)} style={styles.rowMain}>
                  <Text style={styles.vendor}>{expense.vendorName || expense.fileName}</Text>
                  <Text style={styles.meta}>
                    {expense.date ? formatLongDate(expense.date) : "No date"} · {NATURE_LABELS[expense.nature]}
                    {expense.isGroup ? " · Group" : ""}
                  </Text>
                </Pressable>
                <View style={styles.rowSide}>
                  <Text style={styles.amount}>{expense.amount == null ? "—" : formatMoney(expense.amount, expense.currency)}</Text>
                  {expense.status === "confirmed" ? (
                    <Pressable onPress={() => toggle(expense)} style={[styles.select, on && styles.selectOn]}>
                      <Text style={[styles.selectText, on && styles.selectTextOn]}>{on ? "Selected" : "Select"}</Text>
                    </Pressable>
                  ) : (
                    <Pill label={STATUS_LABELS[expense.status]} tone="neutral" />
                  )}
                </View>
              </View>
            );
          })
        )}
        <Text style={styles.help}>Tap a bill to open it. Select ready bills to put them on one claim.</Text>
      </ScrollView>
      {selected.length > 0 ? (
        <View style={styles.bar}>
          <Button
            disabled={busy}
            label={busy ? "Creating…" : `Create claim · ${formatMoney(selectedAmount)}`}
            onPress={() => void makeClaim()}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.bg, flex: 1 },
  content: { gap: 10, padding: 20, paddingBottom: 120, width: "100%", maxWidth: 760, alignSelf: "center" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  filter: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  filterOn: { backgroundColor: theme.ink, borderColor: theme.ink },
  filterText: { color: theme.ink, fontSize: 13, fontWeight: "700" },
  filterTextOn: { color: "#FFFFFF" },
  empty: { color: theme.muted, fontSize: 15, lineHeight: 21, marginTop: 12 },
  row: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 12, padding: 14 },
  rowOn: { borderColor: theme.green, borderWidth: 2 },
  rowMain: { flex: 1, gap: 4 },
  vendor: { color: theme.ink, fontSize: 16, fontWeight: "700" },
  meta: { color: theme.muted, fontSize: 13 },
  rowSide: { alignItems: "flex-end", gap: 6 },
  amount: { color: theme.ink, fontSize: 15, fontWeight: "800" },
  select: { borderColor: theme.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  selectOn: { backgroundColor: theme.green, borderColor: theme.green },
  selectText: { color: theme.ink, fontSize: 12, fontWeight: "700" },
  selectTextOn: { color: "#FFFFFF" },
  help: { color: theme.muted, fontSize: 12, marginTop: 8 },
  bar: { backgroundColor: theme.bg, borderTopColor: theme.line, borderTopWidth: 1, bottom: 0, left: 0, padding: 16, position: "absolute", right: 0 },
});
