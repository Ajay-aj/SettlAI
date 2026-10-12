import { useCallback, useLayoutEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { listClaims } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Notice, Pill } from "../components/ui";
import { formatMoney } from "../format";
import type { HomeNavigation } from "../navigation/types";
import { theme } from "../theme";
import { STATUS_LABELS, type Claim } from "../types";

export function AdminHomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => void auth.signOut()} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      ),
    });
  }, [auth, navigation]);

  const toApprove = claims.filter((claim) => claim.displayStatus === "submitted");
  const toPay = claims.filter((claim) => claim.displayStatus === "approved" || claim.displayStatus === "partially_paid");

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
      style={styles.screen}
    >
      <Text style={styles.lead}>Approve submitted claims, then log each payment.</Text>
      {error ? <Notice>{error}</Notice> : null}
      <Section
        claims={toApprove}
        empty="Nothing is waiting for approval."
        title="To approve"
        onOpen={(claimId) => navigation.navigate("Claim", { claimId })}
      />
      <Section
        claims={toPay}
        empty="Nothing is waiting for a payment."
        title="Log payment"
        onOpen={(claimId) => navigation.navigate("Claim", { claimId })}
      />
    </ScrollView>
  );
}

function Section({
  title,
  claims,
  empty,
  onOpen,
}: {
  title: string;
  claims: Claim[];
  empty: string;
  onOpen: (claimId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title}
        {claims.length > 0 ? ` · ${claims.length}` : ""}
      </Text>
      {claims.length === 0 ? <Text style={styles.empty}>{empty}</Text> : null}
      {claims.map((claim) => (
        <Pressable key={claim.id} onPress={() => onOpen(claim.id)} style={styles.card}>
          <View style={styles.top}>
            <Text style={styles.title}>{claim.title}</Text>
            <Pill label={STATUS_LABELS[claim.displayStatus]} tone={claim.displayStatus === "submitted" ? "amber" : "green"} />
          </View>
          <Text style={styles.meta}>
            {claim.submitterEmail} · {claim.expenseCount} {claim.expenseCount === 1 ? "bill" : "bills"}
          </Text>
          <Text style={styles.amount}>
            {formatMoney(claim.outstanding)} outstanding of {formatMoney(claim.total)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.bg, flex: 1 },
  content: { gap: 18, padding: 20, paddingBottom: 32, width: "100%", maxWidth: 760, alignSelf: "center" },
  lead: { color: theme.ink, fontSize: 22, fontWeight: "800", lineHeight: 28 },
  section: { gap: 10 },
  sectionTitle: { color: theme.ink, fontSize: 18, fontWeight: "800" },
  empty: { color: theme.muted, fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 16, borderWidth: 1, gap: 6, padding: 14 },
  top: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  title: { color: theme.ink, flex: 1, fontSize: 16, fontWeight: "700" },
  meta: { color: theme.muted, fontSize: 13 },
  amount: { color: theme.ink, fontSize: 14, fontWeight: "700" },
  signOut: { color: theme.green, fontWeight: "700", paddingRight: 4 },
});
