import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { fetchBillFile } from "../api";
import { previewStore } from "../previewStore";
import { theme } from "../theme";
import { PdfPages } from "./PdfPages";

export function BillPreview({
  expenseId,
  mimeType,
  fileName,
  size = "card",
}: {
  expenseId: string;
  mimeType: string;
  fileName: string;
  size?: "thumb" | "card" | "full";
}) {
  const isPdf = mimeType.includes("pdf");
  const local = isPdf ? undefined : previewStore.get(expenseId);
  const [uri, setUri] = useState<string | null>(local ?? null);
  const [headers, setHeaders] = useState<Record<string, string> | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isPdf || local) return;
    let cancelled = false;
    const created = { uri: "" };
    void fetchBillFile(expenseId)
      .then((file) => {
        if (cancelled) {
          if (file.uri.startsWith("blob:")) URL.revokeObjectURL(file.uri);
          return;
        }
        if (file.uri.startsWith("blob:")) created.uri = file.uri;
        setUri(file.uri);
        setHeaders(file.headers);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (created.uri) URL.revokeObjectURL(created.uri);
    };
  }, [expenseId, isPdf, local]);

  if (isPdf && size === "thumb") {
    return (
      <View style={[styles.placeholder, styles.thumb]}>
        <Text style={styles.label}>PDF</Text>
      </View>
    );
  }

  if (isPdf) return <PdfPages expenseId={expenseId} fileName={fileName} />;

  const frame = size === "thumb" ? styles.thumb : size === "full" ? styles.full : styles.card;

  if (!uri && !failed) {
    return (
      <View style={[styles.placeholder, frame]}>
        <ActivityIndicator color={theme.green} />
      </View>
    );
  }

  if (failed || !uri) {
    return (
      <View style={[styles.placeholder, frame]}>
        <Text style={styles.label}>Bill unavailable</Text>
      </View>
    );
  }

  return <Image source={{ uri, headers }} resizeMode="contain" style={[styles.image, frame]} />;
}

const styles = StyleSheet.create({
  image: { backgroundColor: "#FFFFFF" },
  thumb: { borderRadius: 10, height: 72, width: 72 },
  card: { borderRadius: 12, height: 180, width: "100%" },
  full: { borderRadius: 12, height: 320, width: "100%" },
  placeholder: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: theme.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
  },
  label: { color: theme.muted, fontSize: 12, fontWeight: "700", paddingHorizontal: 8, textAlign: "center" },
});
