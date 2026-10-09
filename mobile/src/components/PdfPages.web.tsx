import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { fetchBillBytes } from "../api";
import { theme } from "../theme";

GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const MAX_PAGES = 4;

export function PdfPages({ expenseId, fileName }: { expenseId: string; fileName: string }) {
  const [pages, setPages] = useState<{ src: string; aspect: number }[]>([]);
  const [extra, setExtra] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchBillBytes(expenseId);
        const pdf = await getDocument({ data }).promise;
        const shown = Math.min(pdf.numPages, MAX_PAGES);
        const next: { src: string; aspect: number }[] = [];
        for (let number = 1; number <= shown; number += 1) {
          const page = await pdf.getPage(number);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2, 1000 / base.width) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) continue;
          await page.render({ canvasContext: context, viewport }).promise;
          next.push({
            src: canvas.toDataURL("image/jpeg", 0.85),
            aspect: viewport.width / viewport.height,
          });
        }
        if (cancelled) return;
        setPages(next);
        setExtra(Math.max(0, pdf.numPages - shown));
      } catch {
        if (!cancelled) setError(`Could not open ${fileName}.`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId, fileName]);

  if (error) {
    return (
      <View style={styles.box}>
        <Text style={styles.label}>{error}</Text>
      </View>
    );
  }

  if (pages.length === 0) {
    return (
      <View style={styles.box}>
        <ActivityIndicator color={theme.green} />
      </View>
    );
  }

  return (
    <View style={styles.pages}>
      {pages.map((page, index) => (
        <Image key={`${expenseId}-${index}`} resizeMode="contain" source={{ uri: page.src }} style={[styles.page, { aspectRatio: page.aspect }]} />
      ))}
      {extra > 0 ? <Text style={styles.more}>{extra} more {extra === 1 ? "page" : "pages"} not shown</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pages: { gap: 8, width: "100%" },
  page: { backgroundColor: "#FFFFFF", borderColor: theme.line, borderRadius: 12, borderWidth: 1, width: "100%" },
  box: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: theme.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 160,
    padding: 12,
  },
  label: { color: theme.muted, fontSize: 13, fontWeight: "700", textAlign: "center" },
  more: { color: theme.muted, fontSize: 12, fontWeight: "700" },
});
