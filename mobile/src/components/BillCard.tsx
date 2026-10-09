import { useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { issuesForBill } from "../bills";
import { formatMoney } from "../format";
import { FOOD_PER_MEAL_LIMIT, groupPrompt } from "../groupExpense";
import { theme } from "../theme";
import { NATURES, NATURE_LABELS, type BillDraft, type ExpenseNature } from "../types";

export function BillCard({
  bill,
  serverIssues,
  onChange,
  onRemove,
}: {
  bill: BillDraft;
  serverIssues: string[];
  onChange: (bill: BillDraft) => void;
  onRemove: () => void;
}) {
  const amount = bill.amount.trim() === "" ? null : Number(bill.amount);
  const meals = Number(bill.mealCount);
  const safeAmount = amount != null && Number.isFinite(amount) ? amount : null;
  const safeMeals = Number.isFinite(meals) ? meals : 1;
  const prompt = groupPrompt(bill.nature, safeAmount, safeMeals, bill.currency);
  const issues = [...new Set([...issuesForBill(bill), ...serverIssues])];
  const [name, setName] = useState("");

  function update(patch: Partial<BillDraft>) {
    const next = { ...bill, ...patch };
    if (patch.nature === "cab") next.isGroup = false;
    onChange(next);
  }

  function addName() {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) return;
    if (bill.groupMembers.some((member) => member.toLowerCase() === clean.toLowerCase())) {
      setName("");
      return;
    }
    update({ groupMembers: [...bill.groupMembers, clean] });
    setName("");
  }

  const showGroup = prompt.ask || bill.isGroup || bill.aiSuggestedGroup || bill.groupMembers.length > 0;

  return (
    <View style={[styles.card, issues.length > 0 && styles.cardIssue]}>
      <View style={styles.header}>
        {bill.localUri && bill.mimeType.startsWith("image/") ? (
          <Image source={{ uri: bill.localUri }} style={styles.preview} />
        ) : (
          <View style={styles.previewFallback}>
            <Text style={styles.previewLabel}>{bill.mimeType === "application/pdf" ? "PDF" : "Bill"}</Text>
          </View>
        )}
        <View style={styles.headerCopy}>
          <Text style={styles.fileName} numberOfLines={2}>
            {bill.fileName}
          </Text>
          {bill.summary ? <Text style={styles.summary}>{bill.summary}</Text> : null}
        </View>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>

      {bill.extractError ? <Text style={styles.extractError}>{bill.extractError}</Text> : null}

      <View style={styles.amountRow}>
        <TextInput
          autoCapitalize="characters"
          maxLength={3}
          onChangeText={(currency) => update({ currency: currency.toUpperCase() })}
          style={styles.currency}
          value={bill.currency}
        />
        <TextInput
          keyboardType="decimal-pad"
          onChangeText={(value) => update({ amount: value.replace(/[^0-9.]/g, "") })}
          placeholder="0.00"
          placeholderTextColor={theme.muted}
          style={styles.amount}
          value={bill.amount}
        />
      </View>

      <Labeled label="Vendor">
        <TextInput
          onChangeText={(vendorName) => update({ vendorName })}
          placeholder="Restaurant, hotel, cab company"
          placeholderTextColor={theme.muted}
          style={styles.input}
          value={bill.vendorName}
        />
      </Labeled>

      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Labeled label="Date">
            <TextInput
              autoCapitalize="none"
              onChangeText={(date) => update({ date })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.muted}
              style={styles.input}
              value={bill.date}
            />
          </Labeled>
        </View>
        {bill.nature === "food" ? (
          <View style={styles.meals}>
            <Text style={styles.fieldLabel}>Meals</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => update({ mealCount: String(Math.max(1, safeMeals - 1)) })} style={styles.step}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.mealCount}>{safeMeals}</Text>
              <Pressable onPress={() => update({ mealCount: String(Math.min(20, safeMeals + 1)) })} style={styles.step}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <Labeled label="Billed to">
        <TextInput
          onChangeText={(billerName) => update({ billerName })}
          placeholder="Name on the bill, if any"
          placeholderTextColor={theme.muted}
          style={styles.input}
          value={bill.billerName}
        />
      </Labeled>

      <Text style={styles.fieldLabel}>Nature</Text>
      <View style={styles.natures}>
        {NATURES.map((nature) => {
          const selected = bill.nature === nature;
          return (
            <Pressable
              key={nature}
              onPress={() => update({ nature: nature as ExpenseNature })}
              style={[styles.nature, selected && styles.natureSelected]}
            >
              <Text style={[styles.natureText, selected && styles.natureTextSelected]}>{NATURE_LABELS[nature]}</Text>
            </Pressable>
          );
        })}
      </View>

      {showGroup ? (
        <GroupBox
          ask={prompt.ask}
          title={prompt.reason === "cab" ? "Group cab?" : prompt.reason === "food_over_limit" ? "Group meal?" : "Group expense"}
          body={groupBody(prompt.reason, prompt.perMealAmount, bill.currency)}
          isGroup={bill.isGroup}
          members={bill.groupMembers}
          hint={hintFor(bill, prompt.ask)}
          name={name}
          onName={setName}
          onAdd={addName}
          onToggle={(isGroup) => update({ isGroup })}
          onRemoveMember={(member) => update({ groupMembers: bill.groupMembers.filter((item) => item !== member) })}
        />
      ) : null}

      {issues.length > 0 ? <Text style={styles.issue}>{issues[0]}</Text> : null}
    </View>
  );
}

function groupBody(
  reason: "cab" | "food_over_limit" | null,
  perMeal: number | null,
  currency: string,
): string {
  if (reason === "cab") return "Leave this off unless the ride was shared.";
  if (reason === "food_over_limit" && perMeal != null) {
    return `${formatMoney(perMeal, currency)} per meal is over ${formatMoney(FOOD_PER_MEAL_LIMIT, currency)}. Turn this on if it was shared, then add each person.`;
  }
  return "Turn this on if more than one person shared it.";
}

function hintFor(bill: BillDraft, ask: boolean): string | null {
  if (!ask || bill.isGroup) return null;
  if (bill.groupMembers.length > 0) return `Names on the bill: ${bill.groupMembers.join(", ")}`;
  if (bill.aiSuggestedGroup) return "This bill looks like it may be shared.";
  return null;
}

function GroupBox({
  ask,
  title,
  body,
  isGroup,
  members,
  hint,
  name,
  onName,
  onAdd,
  onToggle,
  onRemoveMember,
}: {
  ask: boolean;
  title: string;
  body: string;
  isGroup: boolean;
  members: string[];
  hint: string | null;
  name: string;
  onName: (value: string) => void;
  onAdd: () => void;
  onToggle: (value: boolean) => void;
  onRemoveMember: (member: string) => void;
}) {
  return (
    <View style={[styles.group, ask && styles.groupAsk]}>
      <Text style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupBody}>{body}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.choiceRow}>
        <Pressable onPress={() => onToggle(false)} style={[styles.choice, !isGroup && styles.choiceOn]}>
          <Text style={[styles.choiceText, !isGroup && styles.choiceTextOn]}>No</Text>
        </Pressable>
        <Pressable onPress={() => onToggle(true)} style={[styles.choice, isGroup && styles.choiceOn]}>
          <Text style={[styles.choiceText, isGroup && styles.choiceTextOn]}>Yes, group</Text>
        </Pressable>
      </View>
      {isGroup ? (
        <View style={styles.names}>
          <View style={styles.chips}>
            {members.map((member) => (
              <Pressable key={member} onPress={() => onRemoveMember(member)} style={styles.chip}>
                <Text style={styles.chipText}>{member}  ×</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.nameRow}>
            <TextInput
              onChangeText={onName}
              onSubmitEditing={onAdd}
              placeholder="Add a name"
              placeholderTextColor={theme.muted}
              style={[styles.input, styles.nameInput]}
              value={name}
            />
            <Pressable onPress={onAdd} style={styles.addName}>
              <Text style={styles.addNameText}>Add</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.labeled}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.card, borderColor: theme.line, borderRadius: 18, borderWidth: 1, gap: 12, padding: 14 },
  cardIssue: { borderColor: "#E7C7C7" },
  header: { flexDirection: "row", gap: 12 },
  preview: { borderRadius: 12, height: 72, width: 72 },
  previewFallback: {
    alignItems: "center",
    backgroundColor: theme.greenSoft,
    borderRadius: 12,
    height: 72,
    justifyContent: "center",
    width: 72,
  },
  previewLabel: { color: theme.green, fontSize: 13, fontWeight: "800" },
  headerCopy: { flex: 1, gap: 4 },
  fileName: { color: theme.ink, fontSize: 15, fontWeight: "700" },
  summary: { color: theme.muted, fontSize: 13, lineHeight: 18 },
  remove: { color: theme.danger, fontSize: 13, fontWeight: "700" },
  extractError: { color: theme.amber, fontSize: 13, lineHeight: 18 },
  amountRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  currency: { color: theme.muted, fontSize: 16, fontWeight: "700", width: 48 },
  amount: { color: theme.ink, flex: 1, fontSize: 32, fontWeight: "700", minHeight: 48 },
  labeled: { gap: 6 },
  fieldLabel: { color: theme.muted, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: "#FFFcf8",
    borderColor: theme.line,
    borderRadius: 12,
    borderWidth: 1,
    color: theme.ink,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  split: { flexDirection: "row", gap: 12 },
  splitItem: { flex: 1 },
  meals: { gap: 6, width: 124 },
  stepper: {
    alignItems: "center",
    borderColor: theme.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 46,
  },
  step: { alignItems: "center", flex: 1, justifyContent: "center" },
  stepText: { color: theme.ink, fontSize: 20 },
  mealCount: { color: theme.ink, fontSize: 16, fontWeight: "700", minWidth: 20, textAlign: "center" },
  natures: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nature: { backgroundColor: "#F3F0EA", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  natureSelected: { backgroundColor: theme.ink },
  natureText: { color: theme.ink, fontSize: 13, fontWeight: "700" },
  natureTextSelected: { color: "#FFFFFF" },
  group: { backgroundColor: "#F7F5F1", borderRadius: 14, gap: 8, padding: 12 },
  groupAsk: { backgroundColor: theme.amberSoft, borderColor: theme.amberLine, borderWidth: 1 },
  groupTitle: { color: theme.ink, fontSize: 15, fontWeight: "700" },
  groupBody: { color: theme.ink, fontSize: 13, lineHeight: 18 },
  hint: { color: theme.amber, fontSize: 13, lineHeight: 18 },
  choiceRow: { flexDirection: "row", gap: 8 },
  choice: {
    alignItems: "center",
    backgroundColor: theme.card,
    borderColor: theme.line,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  choiceOn: { backgroundColor: theme.ink, borderColor: theme.ink },
  choiceText: { color: theme.ink, fontWeight: "700" },
  choiceTextOn: { color: "#FFFFFF" },
  names: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: theme.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: theme.ink, fontSize: 13, fontWeight: "600" },
  nameRow: { flexDirection: "row", gap: 8 },
  nameInput: { flex: 1 },
  addName: { alignItems: "center", backgroundColor: theme.green, borderRadius: 12, justifyContent: "center", paddingHorizontal: 14 },
  addNameText: { color: "#FFFFFF", fontWeight: "700" },
  issue: { color: theme.danger, fontSize: 13, fontWeight: "600" },
});
