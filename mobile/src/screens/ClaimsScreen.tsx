import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { listClaims } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Notice, Pill } from "../components/ui";
import { formatMoney } from "../format";
import type { AppStackParamList } from "../navigation/types";
import { theme } from "../theme";
import { STATUS_LABELS, type Claim } from "../types";

export function ClaimsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const auth = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setClaims(await listClaims());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load claims.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
      style={styles.screen}
    >
      {error ? <Notice>{error}</Notice> : null}
      {claims.length === 0 ? (
        <Text style={styles.empty}>
          {auth.isAdmin
            ? "Submitted claims show up here for approval and payment."
            : "When you confirm bills, select them and create a claim. An admin approves it and logs payment."}
        </Text>
      ) : (
        claims.map((claim) => {
          const progress = claim.total > 0 ? Math.min(100, (claim.paid / claim.total) * 100) : 0;
          return (
            <Pressable key={claim.id} onPress={() => navigation.navigate("Claim", { claimId: claim.id })} style={styles.card}>
              <View style={styles.top}>
                <Text style={styles.title}>{claim.title}</Text>
                <Pill label={STATUS_LABELS[claim.displayStatus]} tone={tone(claim.displayStatus)} />
              </View>
              <Text style={styles.meta}>
                {auth.isAdmin ? `${claim.submitterEmail} · ` : ""}
                {claim.expenseCount} bills · {formatMoney(claim.outstanding)} outstanding
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.paid}>
                {formatMoney(claim.paid)} paid of {formatMoney(claim.total)}
              </Text>
            </Pressable>
          );
        })
      )}
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
  content: { gap: 12, padding: 20, width: "100%", maxWidth: 760, alignSelf: "center" },
  empty: { color: theme.muted, fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 16, borderWidth: 1, gap: 8, padding: 14 },
  top: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  title: { color: theme.ink, flex: 1, fontSize: 16, fontWeight: "700" },
  meta: { color: theme.muted, fontSize: 13 },
  track: { backgroundColor: "#EFEBE4", borderRadius: 999, height: 8, overflow: "hidden" },
  fill: { backgroundColor: theme.green, height: 8 },
  paid: { color: theme.ink, fontSize: 13, fontWeight: "600" },
});
