import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ApiError, confirmExpenses, deleteExpense, getExpense } from "../api";
import { issuesForBill, payloadForBill } from "../bills";
import { AddBillsSheet } from "../components/AddBillsSheet";
import { BillCard } from "../components/BillCard";
import { BusyOverlay, Button } from "../components/ui";
import { useBillImporter } from "../importer";
import type { AppStackParamList } from "../navigation/types";
import { previewStore } from "../previewStore";
import { theme } from "../theme";
import { toDraft, type BillDraft } from "../types";

export function ReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, "Review">>();
  const importer = useBillImporter();
  const { setSheetOpen } = importer;
  const insets = useSafeAreaInsets();
  const skipLeaveWarning = useRef(false);
  const [bills, setBills] = useState<BillDraft[] | null>(null);
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offsets = useRef<Record<string, number>>({});
  const scrollRef = useRef<ScrollView>(null);
  const initial = useRef<string>("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await Promise.all(route.params.expenseIds.map((id) => getExpense(id)));
        if (!active) return;
        const drafts = loaded.map((expense) => toDraft(expense, previewStore.get(expense.id)));
        initial.current = JSON.stringify(drafts);
        setBills(drafts);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load these bills.");
      }
    })();
    return () => {
      active = false;
    };
  }, [route.params.expenseIds]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: bills ? `${bills.length} ${bills.length === 1 ? "bill" : "bills"}` : "Confirm bills",
      headerRight: () => (
        <Text onPress={() => setSheetOpen(true)} style={styles.add}>
          Add
        </Text>
      ),
    });
  }, [bills?.length, navigation, setSheetOpen]);

  const dirty = bills != null && JSON.stringify(bills) !== initial.current;
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!dirty || busy || skipLeaveWarning.current) return;
      event.preventDefault();
      Alert.alert("Leave without confirming?", "These uploads stay under To review, but edits on this screen are kept only after you confirm.", [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
    return unsubscribe;
  }, [busy, dirty, navigation]);

  function update(next: BillDraft) {
    setBills((current) => current?.map((bill) => (bill.id === next.id ? next : bill)) ?? null);
    setIssues((current) => ({ ...current, [next.id]: [] }));
  }

  async function remove(id: string) {
    try {
      await deleteExpense(id);
      setBills((current) => current?.filter((bill) => bill.id !== id) ?? null);
    } catch (err) {
      Alert.alert("Could not remove the bill", err instanceof Error ? err.message : "Try again.");
    }
  }

  async function confirm() {
    if (!bills || bills.length === 0) return;
    const localIssues: Record<string, string[]> = {};
    for (const bill of bills) {
      const found = issuesForBill(bill);
      if (found.length > 0) localIssues[bill.id] = found;
    }
    if (Object.keys(localIssues).length > 0) {
      setIssues(localIssues);
      const first = bills.find((bill) => localIssues[bill.id]);
      if (first) scrollRef.current?.scrollTo({ y: Math.max(0, (offsets.current[first.id] ?? 0) - 12), animated: true });
      return;
    }

    setBusy(true);
    try {
      await confirmExpenses(bills.map(payloadForBill));
      skipLeaveWarning.current = true;
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) {
        const next: Record<string, string[]> = {};
        for (const issue of err.issues) next[issue.id] = issue.errors;
        setIssues(next);
      } else {
        Alert.alert("Could not confirm", err instanceof Error ? err.message : "Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const problemCount = bills?.filter((bill) => issuesForBill(bill).length > 0 || (issues[bill.id]?.length ?? 0) > 0).length ?? 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {bills == null && !error ? <Text style={styles.loading}>Loading bills…</Text> : null}
        {bills?.map((bill) => (
          <View
            key={bill.id}
            onLayout={(event) => {
              offsets.current[bill.id] = event.nativeEvent.layout.y;
            }}
          >
            <BillCard
              bill={bill}
              serverIssues={issues[bill.id] ?? []}
              onChange={update}
              onRemove={() => void remove(bill.id)}
            />
          </View>
        ))}
      </ScrollView>
      {bills && bills.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Button
            disabled={busy}
            label={
              busy
                ? "Saving…"
                : problemCount > 0
                  ? `Fix ${problemCount} ${problemCount === 1 ? "bill" : "bills"}`
                  : `Confirm ${bills.length} ${bills.length === 1 ? "bill" : "bills"}`
            }
            onPress={() => void confirm()}
          />
        </View>
      ) : null}
      <AddBillsSheet
        visible={importer.sheetOpen}
        onClose={() => importer.setSheetOpen(false)}
        onChoose={(source) => {
          void importer.choose(source).then((expenses) => {
            if (expenses.length === 0) return;
            setBills((current) => [
              ...(current ?? []),
              ...expenses.map((expense) => toDraft(expense, previewStore.get(expense.id))),
            ]);
          });
        }}
      />
      <BusyOverlay label={importer.busyLabel} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.bg, flex: 1 },
  content: { gap: 14, padding: 20, paddingBottom: 120, width: "100%", maxWidth: 760, alignSelf: "center" },
  footer: { backgroundColor: theme.bg, borderTopColor: theme.line, borderTopWidth: 1, padding: 16 },
  loading: { color: theme.muted, fontSize: 15 },
  error: { color: theme.danger, fontSize: 15 },
  add: { color: theme.green, fontWeight: "700", paddingRight: 4 },
});
