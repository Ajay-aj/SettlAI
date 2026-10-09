import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

export function PdfPages({ fileName }: { expenseId: string; fileName: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.label}>PDF · {fileName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: theme.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 96,
    padding: 12,
  },
  label: { color: theme.muted, fontSize: 13, fontWeight: "700", textAlign: "center" },
});
