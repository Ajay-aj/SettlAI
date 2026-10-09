import { config } from "./config";
import {
  emptyExtraction,
  extractionPrompt,
  normalizeExtraction,
  parseModelJson,
  type RawExtraction,
} from "./model";

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

export function normalizeMimeType(mimeType: string, fileName: string): string | null {
  const lowered = mimeType.toLowerCase().split(";")[0].trim();
  const alias = lowered === "image/jpg" ? "image/jpeg" : lowered;
  if (Object.values(MIME_BY_EXTENSION).includes(alias)) return alias;
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

export type BillReading = RawExtraction & {
  extractError: string | null;
};

function readingFromModel(text: string): BillReading {
  const parsed = normalizeExtraction(parseModelJson(text));
  return { ...parsed, extractError: null };
}

function failedReading(message: string): BillReading {
  return { ...emptyExtraction(), extractError: message };
}

const FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
const BUSY_MESSAGE = "The bill reader is busy right now. Wait a moment and upload this bill again.";

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

type ModelAttempt =
  | { ok: true; text: string }
  | { ok: false; busy: boolean; message: string };

function modelsToTry(primary: string): string[] {
  return [primary, ...FALLBACK_MODELS.filter((model) => model !== primary)];
}

export function isBusyResponse(status: number, message: string): boolean {
  return (
    status === 429 ||
    status === 503 ||
    /high demand|try again later|overloaded|unavailable|resource exhausted/i.test(message)
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function askModel(
  model: string,
  prompt: string,
  mimeType: string,
  bytes: Buffer,
): Promise<ModelAttempt> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: bytes.toString("base64") } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "LOW" },
          },
        }),
      },
    );
    const payload = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      const message = payload.error?.message ?? "The bill reader could not process this file.";
      return { ok: false, busy: isBusyResponse(response.status, message), message };
    }
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
    if (!text) return { ok: false, busy: false, message: "No details came back for this file. Enter them yourself." };
    return { ok: true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read this file.";
    const busy = error instanceof Error && error.name === "TimeoutError";
    return { ok: false, busy, message };
  }
}

export async function readBill(
  bytes: Buffer,
  mimeType: string,
  fileName: string,
): Promise<BillReading> {
  const normalizedMime = normalizeMimeType(mimeType, fileName);
  if (!normalizedMime) {
    return failedReading("Use a photo (JPG, PNG, WEBP, HEIC) or a PDF.");
  }
  if (bytes.length === 0) {
    return failedReading("This file is empty.");
  }
  if (!config.geminiApiKey) {
    return failedReading(
      "Automatic reading is off until a Gemini API key is set. Enter the bill details.",
    );
  }

  const prompt = extractionPrompt();
  let sawBusy = false;
  for (const model of modelsToTry(config.geminiModel)) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await askModel(model, prompt, normalizedMime, bytes);
      if (result.ok) return readingFromModel(result.text);
      if (!result.busy) return failedReading(result.message);
      sawBusy = true;
      if (attempt === 0) await wait(1000);
    }
  }

  return failedReading(sawBusy ? BUSY_MESSAGE : "Could not read this file.");
}
