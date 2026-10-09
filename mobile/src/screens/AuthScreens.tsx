import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { Button, Field, Notice } from "../components/ui";
import { isFirebaseConfigured } from "../config";
import type { AuthStackParamList } from "../navigation/types";
import { theme } from "../theme";

export function SignInScreen() {
  return <AuthScreen mode="signIn" />;
}

export function SignUpScreen() {
  return <AuthScreen mode="signUp" />;
}

function AuthScreen({ mode }: { mode: "signIn" | "signUp" }) {
  const auth = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const firebaseReady = isFirebaseConfigured();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "signIn") await auth.signIn(email, password);
      else await auth.signUp(name, email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t continue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.mark}>
          <Text style={styles.markText}>R</Text>
        </View>
        <Text style={styles.title}>{mode === "signIn" ? "Reimburse" : "Create your account"}</Text>
        <Text style={styles.subtitle}>Photograph a bill, confirm the details, and track what you’re owed.</Text>

        {firebaseReady ? (
          <View style={styles.form}>
            {mode === "signUp" ? (
              <Field
                autoCapitalize="words"
                autoComplete="name"
                label="Your name"
                onChangeText={setName}
                placeholder="Name used on bills"
                value={name}
              />
            ) : null}
            <Field
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              value={email}
            />
            <Field
              autoCapitalize="none"
              label="Password"
              onChangeText={setPassword}
              secureTextEntry
              value={password}
            />
            {mode === "signUp" ? <Text style={styles.hint}>Use at least 6 characters.</Text> : null}
            {error ? <Notice>{error}</Notice> : null}
            <Button
              disabled={busy || !email.trim() || password.length < 6 || (mode === "signUp" && name.trim().length < 2)}
              label={busy ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"}
              onPress={() => void submit()}
            />
            <Pressable
              onPress={() => (mode === "signIn" ? navigation.navigate("SignUp") : navigation.navigate("SignIn"))}
            >
              <Text style={styles.link}>
                {mode === "signIn" ? "New here? Create an account" : "Already have an account? Sign in"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Notice>Firebase isn’t configured yet. You can explore the demo, then add the keys when you’re ready to sign in.</Notice>
        )}

        {mode === "signIn" ? (
          <Button label="Explore with demo data" onPress={() => void auth.signInDemo()} tone="secondary" />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.bg, flex: 1 },
  content: { flexGrow: 1, gap: 16, justifyContent: "center", padding: 24, width: "100%", maxWidth: 520, alignSelf: "center" },
  mark: {
    alignItems: "center",
    backgroundColor: theme.green,
    borderRadius: 16,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  markText: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  title: { color: theme.ink, fontSize: 32, fontWeight: "800" },
  subtitle: { color: theme.muted, fontSize: 16, lineHeight: 22 },
  form: { gap: 12 },
  hint: { color: theme.muted, fontSize: 13 },
  link: { color: theme.green, fontSize: 15, fontWeight: "700", textAlign: "center" },
});
