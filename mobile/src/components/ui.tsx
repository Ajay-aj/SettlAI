import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { theme } from "../theme";

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={theme.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "primary" ? styles.primary : tone === "danger" ? styles.danger : styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, tone !== "primary" && tone !== "danger" && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "green" | "amber" | "danger" }) {
  return (
    <View
      style={[
        styles.pill,
        tone === "green" && styles.pillGreen,
        tone === "amber" && styles.pillAmber,
        tone === "danger" && styles.pillDanger,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === "green" && styles.pillTextGreen,
          tone === "amber" && styles.pillTextAmber,
          tone === "danger" && styles.pillTextDanger,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function BusyOverlay({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <View style={styles.overlay}>
      <View style={styles.overlayCard}>
        <ActivityIndicator color={theme.green} />
        <Text style={styles.overlayText}>{label}</Text>
      </View>
    </View>
  );
}

export function Notice({ children }: { children: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: theme.muted, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: theme.card,
    borderColor: theme.line,
    borderRadius: 12,
    borderWidth: 1,
    color: theme.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: { alignItems: "center", borderRadius: 14, justifyContent: "center", minHeight: 52, paddingHorizontal: 16 },
  primary: { backgroundColor: theme.green },
  secondary: { backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1 },
  danger: { backgroundColor: theme.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryText: { color: theme.ink },
  pill: { alignSelf: "flex-start", backgroundColor: "#F1EEE8", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillGreen: { backgroundColor: theme.greenSoft },
  pillAmber: { backgroundColor: theme.amberSoft },
  pillDanger: { backgroundColor: theme.dangerSoft },
  pillText: { color: theme.muted, fontSize: 12, fontWeight: "700" },
  pillTextGreen: { color: theme.green },
  pillTextAmber: { color: theme.amber },
  pillTextDanger: { color: theme.danger },
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(28, 25, 23, 0.28)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  overlayCard: {
    alignItems: "center",
    backgroundColor: theme.card,
    borderRadius: 16,
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  overlayText: { color: theme.ink, fontSize: 15, fontWeight: "600" },
  notice: { backgroundColor: theme.amberSoft, borderRadius: 12, padding: 12 },
  noticeText: { color: theme.amber, fontSize: 14, lineHeight: 20 },
});
