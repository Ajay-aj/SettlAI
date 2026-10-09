import { useState } from "react";
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { extractBills, type LocalFile } from "./api";
import { previewStore } from "./previewStore";
import type { Expense } from "./types";

function fromImage(asset: ImagePicker.ImagePickerAsset, index: number): LocalFile {
  return {
    uri: asset.uri,
    name: asset.fileName ?? `bill-${index + 1}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

export async function pickPhotos(): Promise<LocalFile[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Photos access is off", "Allow photo access to upload bills.");
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.6,
    selectionLimit: 10,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, 10).map(fromImage);
}

export async function captureBills(): Promise<LocalFile[]> {
  if (Platform.OS === "web") {
    Alert.alert("Use photos or a PDF here", "The camera is available in the iOS and Android app.");
    return [];
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Camera access is off", "Allow camera access to photograph bills.");
    return [];
  }

  const files: LocalFile[] = [];
  while (files.length < 10) {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled || !result.assets[0]) break;
    files.push(fromImage(result.assets[0], files.length));
    if (files.length >= 10) break;
    const another = await new Promise<boolean>((resolve) => {
      Alert.alert(
        files.length === 1 ? "1 bill captured" : `${files.length} bills captured`,
        "Take another photo, or read these now.",
        [
          { text: "Read now", onPress: () => resolve(false) },
          { text: "Take another", onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });
    if (!another) break;
  }
  return files;
}

export async function pickPdfs(): Promise<LocalFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, 10).map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? "application/pdf",
  }));
}

export function useBillImporter() {
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  async function choose(source: "camera" | "photos" | "pdf"): Promise<Expense[]> {
    setSheetOpen(false);
    try {
      const files =
        source === "camera" ? await captureBills() : source === "photos" ? await pickPhotos() : await pickPdfs();
      if (files.length === 0) return [];
      setBusyLabel(`Reading ${files.length} ${files.length === 1 ? "bill" : "bills"}…`);
      const expenses = await extractBills(files);
      files.forEach((file, index) => {
        const expense = expenses[index];
        if (expense) previewStore.set(expense.id, file.uri);
      });
      return expenses;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read those bills.";
      Alert.alert("Could not read bills", message);
      return [];
    } finally {
      setBusyLabel(null);
    }
  }

  return { busyLabel, sheetOpen, setSheetOpen, choose };
}
