import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme";

export function AddBillsSheet({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (source: "camera" | "photos" | "pdf") => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <Text style={styles.title}>Add bills</Text>
          <Text style={styles.caption}>Photos and PDFs can be selected together, up to 10 at a time.</Text>
          <SheetRow title="Take a photo" detail="Camera, then add more shots if you need them" onPress={() => onChoose("camera")} />
          <SheetRow title="Choose photos" detail="Select several from your library" onPress={() => onChoose("photos")} />
          <SheetRow title="Choose PDFs" detail="Invoices and downloaded bills" onPress={() => onChoose("pdf")} />
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowDetail}>{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(28, 25, 23, 0.35)", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: 10, padding: 18 },
  title: { color: theme.ink, fontSize: 20, fontWeight: "700" },
  caption: { color: theme.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  row: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 14, borderWidth: 1, gap: 2, padding: 14 },
  pressed: { opacity: 0.8 },
  rowTitle: { color: theme.ink, fontSize: 16, fontWeight: "700" },
  rowDetail: { color: theme.muted, fontSize: 13 },
  cancel: { alignItems: "center", paddingVertical: 10 },
  cancelText: { color: theme.muted, fontSize: 15, fontWeight: "600" },
});
