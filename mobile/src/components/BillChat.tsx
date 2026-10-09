import { createElement, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { LocalFile } from "../api";
import { issuesForBill } from "../bills";
import { BillPreview } from "./BillPreview";
import { formatLongDate, formatMoney } from "../format";
import { theme } from "../theme";
import { NATURE_LABELS, STATUS_LABELS, toDraft, type Claim, type Expense } from "../types";

export type ChatAction = { label: string; command: string };

export type ChatTurn =
  | { id: string; kind: "note"; text: string; actions?: ChatAction[] }
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "files"; files: { name: string; uri: string; mimeType: string }[] }
  | { id: string; kind: "bills"; intro: string; expenses: Expense[]; actions?: ChatAction[] }
  | { id: string; kind: "claims"; intro: string; claims: Claim[]; actions?: ChatAction[] }
  | { id: string; kind: "error"; text: string };

export const EMPLOYEE_SUGGESTIONS = ["Bills to review", "In review", "Submitted", "Approved", "Send for approval"];
export const ADMIN_SUGGESTIONS = ["In review", "Submitted", "Approved", "Paid"];

function mimeFromName(name: string): string {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  return "";
}

function browserFiles(files: File[]): LocalFile[] {
  const accepted: LocalFile[] = [];
  for (const file of files) {
    const mimeType = file.type || mimeFromName(file.name);
    if (!mimeType.startsWith("image/") && mimeType !== "application/pdf") continue;
    accepted.push({
      uri: URL.createObjectURL(file),
      name: file.name || "bill",
      mimeType,
    });
  }
  return accepted;
}

function DropSurface({
  children,
  enabled,
  onFiles,
}: {
  children: ReactNode;
  enabled: boolean;
  onFiles: (files: LocalFile[]) => void;
}) {
  const [active, setActive] = useState(false);
  if (!enabled || Platform.OS !== "web") return <View style={styles.fill}>{children}</View>;

  return createElement(
    "div",
    {
      style: {
        display: "flex",
        flex: 1,
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
      },
      onDragEnter: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setActive(true);
      },
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setActive(true);
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setActive(false);
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setActive(false);
        onFiles(browserFiles(Array.from(event.dataTransfer.files)));
      },
    },
    children,
    active
      ? createElement(
          "div",
          {
            style: {
              alignItems: "center",
              background: "rgba(246, 243, 238, 0.92)",
              border: "2px dashed #0E6B4F",
              borderRadius: "16px",
              bottom: "76px",
              color: "#0E6B4F",
              display: "flex",
              fontWeight: 700,
              justifyContent: "center",
              left: "12px",
              pointerEvents: "none",
              position: "absolute",
              right: "12px",
              top: "8px",
            },
          },
          "Drop to create a bill for each file",
        )
      : null,
  );
}

export function BillChat({
  turns,
  busy,
  canAttach,
  suggestions,
  onAttach,
  onFiles,
  onSend,
  onOpenClaim,
  onOpenExpense,
}: {
  turns: ChatTurn[];
  busy: string | null;
  canAttach: boolean;
  suggestions: string[];
  onAttach: () => void;
  onFiles: (files: LocalFile[]) => void;
  onSend: (text: string) => void;
  onOpenClaim: (claimId: string) => void;
  onOpenExpense: (expenseId: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");

  function attach() {
    if (Platform.OS === "web") inputRef.current?.click();
    else onAttach();
  }

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    onSend(text);
  }

  return (
    <DropSurface enabled={canAttach} onFiles={onFiles}>
      <View style={styles.fill}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          style={styles.fill}
        >
          {turns.map((turn) => (
            <TurnView key={turn.id} onOpenClaim={onOpenClaim} onOpenExpense={onOpenExpense} onSend={onSend} turn={turn} />
          ))}
          {busy ? <Text style={styles.busy}>{busy}</Text> : null}
        </ScrollView>
        <ScrollView horizontal contentContainerStyle={styles.suggestions} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={styles.suggestionBar}>
          {suggestions.map((suggestion) => (
            <Pressable key={suggestion} disabled={Boolean(busy)} onPress={() => onSend(suggestion)} style={styles.chip}>
              <Text style={styles.chipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.composer}>
          <TextInput
            editable={!busy}
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder={canAttach ? "Ask for bills, or say send for approval" : "Ask for claims in review, submitted, or approved"}
            placeholderTextColor={theme.muted}
            returnKeyType="send"
            style={styles.input}
            value={draft}
          />
          {canAttach ? (
            <Pressable accessibilityRole="button" onPress={attach} style={styles.attach}>
              <Text style={styles.attachLabel}>Attach</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" disabled={!draft.trim() || Boolean(busy)} onPress={send} style={[styles.send, (!draft.trim() || busy) && styles.sendOff]}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
        {canAttach && Platform.OS === "web"
          ? createElement("input", {
              ref: inputRef,
              type: "file",
              accept: "image/*,application/pdf",
              multiple: true,
              style: { display: "none" },
              onChange: (event: Event) => {
                const input = event.currentTarget as HTMLInputElement;
                const files = browserFiles(Array.from(input.files ?? []));
                input.value = "";
                onFiles(files);
              },
            })
          : null}
      </View>
    </DropSurface>
  );
}

function TurnView({
  turn,
  onSend,
  onOpenClaim,
  onOpenExpense,
}: {
  turn: ChatTurn;
  onSend: (text: string) => void;
  onOpenClaim: (claimId: string) => void;
  onOpenExpense: (expenseId: string) => void;
}) {
  if (turn.kind === "user") {
    return (
      <View style={styles.userWrap}>
        <View style={styles.user}>
          <Text style={styles.userText}>{turn.text}</Text>
        </View>
      </View>
    );
  }
  if (turn.kind === "note") {
    return (
      <View style={styles.assistant}>
        <Text style={styles.body}>{turn.text}</Text>
        <Actions actions={turn.actions} onSend={onSend} />
      </View>
    );
  }
  if (turn.kind === "error") {
    return (
      <View style={[styles.assistant, styles.errorBubble]}>
        <Text style={styles.errorText}>{turn.text}</Text>
      </View>
    );
  }
  if (turn.kind === "files") {
    return (
      <View style={styles.userWrap}>
        <View style={styles.user}>
          <Text style={styles.userTitle}>
            {turn.files.length} {turn.files.length === 1 ? "bill" : "bills"}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fileRow}>
            {turn.files.map((file) => (
              <View key={file.uri} style={styles.fileChip}>
                {file.mimeType.startsWith("image/") ? (
                  <Image source={{ uri: file.uri }} style={styles.thumb} />
                ) : (
                  <View style={styles.thumbFallback}>
                    <Text style={styles.thumbLabel}>PDF</Text>
                  </View>
                )}
                <Text numberOfLines={2} style={styles.fileName}>
                  {file.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  if (turn.kind === "claims") {
    return (
      <View style={styles.assistant}>
        <Text style={styles.body}>{turn.intro}</Text>
        {turn.claims.map((claim) => (
          <Pressable key={claim.id} accessibilityRole="button" onPress={() => onOpenClaim(claim.id)} style={({ pressed }) => [styles.bill, pressed && styles.pressed]}>
            <View style={styles.billTop}>
              <Text numberOfLines={1} style={styles.vendor}>
                {claim.title}
              </Text>
              <Text style={styles.amount}>{formatMoney(claim.total)}</Text>
            </View>
            <Text style={styles.meta}>
              {STATUS_LABELS[claim.displayStatus]} · {formatMoney(claim.outstanding)} outstanding
              {claim.submitterEmail ? ` · ${claim.submitterEmail}` : ""}
            </Text>
            <Text style={styles.view}>View</Text>
          </Pressable>
        ))}
        <Actions actions={turn.actions} onSend={onSend} />
      </View>
    );
  }

  return (
    <View style={styles.assistant}>
      <Text style={styles.body}>{turn.intro}</Text>
      {turn.expenses.map((expense) => {
        const issues = issuesForBill(toDraft(expense));
        return (
          <View key={expense.id} style={styles.bill}>
            <BillPreview expenseId={expense.id} fileName={expense.fileName} mimeType={expense.mimeType} size="card" />
            <Pressable
              accessibilityRole="button"
              onPress={() => (expense.claimId ? onOpenClaim(expense.claimId) : onOpenExpense(expense.id))}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
            <View style={styles.billTop}>
              <Text numberOfLines={1} style={styles.vendor}>
                {expense.vendorName || expense.fileName}
              </Text>
              <Text style={styles.amount}>
                {expense.amount == null ? "Amount missing" : formatMoney(expense.amount, expense.currency)}
              </Text>
            </View>
            <Text style={styles.meta}>
              {STATUS_LABELS[expense.status]} · {expense.date ? formatLongDate(expense.date) : "No date"} · {NATURE_LABELS[expense.nature]}
              {expense.billerName ? ` · ${expense.billerName}` : ""}
            </Text>
            {issues.map((issue) => (
              <Text key={issue} style={styles.warn}>
                {issue}
              </Text>
            ))}
            {expense.extractError ? <Text style={styles.warn}>{expense.extractError}</Text> : null}
            <Text style={styles.view}>View</Text>
            </Pressable>
          </View>
        );
      })}
      <Actions actions={turn.actions} onSend={onSend} />
    </View>
  );
}

function Actions({ actions, onSend }: { actions?: ChatAction[]; onSend: (text: string) => void }) {
  if (!actions?.length) return null;
  return (
    <View style={styles.actions}>
      {actions.map((action) => (
        <Pressable key={action.label} onPress={() => onSend(action.command)} style={styles.action}>
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  thread: { gap: 12, paddingBottom: 8, paddingHorizontal: 16, paddingTop: 4, width: "100%", maxWidth: 760, alignSelf: "center" },
  assistant: { alignSelf: "stretch", backgroundColor: theme.card, borderColor: theme.line, borderRadius: 16, borderWidth: 1, gap: 8, padding: 12 },
  body: { color: theme.ink, fontSize: 15, lineHeight: 21 },
  errorBubble: { backgroundColor: theme.dangerSoft, borderColor: "#E7C8C8" },
  errorText: { color: theme.danger, fontSize: 14, lineHeight: 20 },
  userWrap: { alignItems: "flex-end" },
  user: { backgroundColor: theme.greenSoft, borderRadius: 16, gap: 8, maxWidth: "92%", padding: 12 },
  userTitle: { color: theme.green, fontSize: 13, fontWeight: "700" },
  fileRow: { gap: 8 },
  fileChip: { width: 88 },
  thumb: { backgroundColor: theme.line, borderRadius: 10, height: 64, width: 88 },
  thumbFallback: { alignItems: "center", backgroundColor: theme.card, borderRadius: 10, height: 64, justifyContent: "center", width: 88 },
  thumbLabel: { color: theme.muted, fontSize: 12, fontWeight: "700" },
  fileName: { color: theme.ink, fontSize: 11, marginTop: 4 },
  bill: { backgroundColor: theme.bg, borderRadius: 12, gap: 3, padding: 10 },
  pressed: { opacity: 0.75 },
  view: { color: theme.green, fontSize: 13, fontWeight: "700" },
  billTop: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  vendor: { color: theme.ink, flex: 1, fontSize: 15, fontWeight: "700" },
  amount: { color: theme.ink, fontSize: 14, fontWeight: "800" },
  meta: { color: theme.muted, fontSize: 13 },
  warn: { color: theme.amber, fontSize: 12, lineHeight: 17 },
  busy: { color: theme.muted, fontSize: 14, paddingHorizontal: 4 },
  userText: { color: theme.ink, fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { backgroundColor: theme.green, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  suggestionBar: { flexGrow: 0, maxHeight: 44 },
  suggestions: { gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  chip: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: theme.ink, fontSize: 13, fontWeight: "700" },
  composer: {
    alignItems: "flex-end",
    alignSelf: "center",
    backgroundColor: theme.card,
    borderColor: theme.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    marginHorizontal: 16,
    marginTop: 8,
    maxWidth: 760,
    padding: 8,
  },
  input: { color: theme.ink, flex: 1, fontSize: 16, maxHeight: 96, minHeight: 40, paddingHorizontal: 8, paddingVertical: 8 },
  attach: { borderColor: theme.line, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10 },
  attachLabel: { color: theme.ink, fontSize: 13, fontWeight: "700" },
  send: { backgroundColor: theme.green, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  sendOff: { opacity: 0.4 },
  sendText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});
