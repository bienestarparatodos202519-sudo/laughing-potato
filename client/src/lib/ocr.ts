import type { OcrResponse } from "../types";

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function runIneOcr(file: File): Promise<OcrResponse> {
  const imageBase64 = await fileToBase64(file);
  const response = await fetch(`${apiBaseUrl}/api/ocr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageBase64,
      mimeType: file.type,
    }),
  });

  const payload = (await response.json()) as OcrResponse | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "No se pudo leer la INE.");
  }

  return payload as OcrResponse;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo local."));
    reader.readAsDataURL(file);
  });
}
