import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { Button, Field, Notice } from "../components/ui";
import { theme } from "../theme";

export function OnboardingScreen() {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await auth.saveName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save your name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Your details</Text>
        <Text style={styles.title}>What name should bills use?</Text>
        <Text style={styles.subtitle}>
          If a bill doesn’t show a name, this is filled in as the person it belongs to. You can still change it on each bill.
        </Text>
        <Field autoCapitalize="words" autoComplete="name" label="Your name" onChangeText={setName} value={name} />
        {error ? <Notice>{error}</Notice> : null}
        <Button disabled={busy || name.trim().length < 2} label={busy ? "Saving…" : "Continue"} onPress={() => void save()} />
        <Pressable onPress={() => void auth.signOut()}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.bg, flex: 1 },
  content: { flexGrow: 1, gap: 16, justifyContent: "center", padding: 24, width: "100%", maxWidth: 520, alignSelf: "center" },
  kicker: { color: theme.green, fontSize: 13, fontWeight: "700" },
  title: { color: theme.ink, fontSize: 32, fontWeight: "800" },
  subtitle: { color: theme.muted, fontSize: 16, lineHeight: 22 },
  link: { color: theme.muted, fontSize: 15, fontWeight: "700", textAlign: "center" },
});
