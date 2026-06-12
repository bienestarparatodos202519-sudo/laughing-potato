import "dotenv/config";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 8080);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_DIST_DIR = process.env.CLIENT_DIST_DIR ?? new URL("../../client/dist", import.meta.url).pathname;

const primaryModels = (process.env.GEMINI_PRIMARY_MODELS ?? "gemini-3.5-flash,gemini-3.1-flash-lite")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const requestSchema = z.object({
  imageBase64: z.string().min(128),
  mimeType: z.string().regex(/^image\/(png|jpe?g|webp)$/i),
});

const extractedSchema = z.object({
  fullName: z.string().optional(),
  curp: z.string().optional(),
  voterKey: z.string().optional(),
  birthDate: z.string().optional(),
});

type ExtractedFields = z.infer<typeof extractedSchema>;

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: CLIENT_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "beneficiarios-ocr", models: primaryModels });
});

app.post("/api/ocr", async (request, response) => {
  const parsedRequest = requestSchema.safeParse(request.body);

  if (!parsedRequest.success) {
    response.status(400).json({
      error: "Formato invalido. Envia imageBase64 y mimeType con una imagen PNG, JPG o WEBP.",
    });
    return;
  }

  if (!GEMINI_API_KEY) {
    response.status(500).json({
      error: "El servidor no tiene GEMINI_API_KEY configurada.",
    });
    return;
  }

  try {
    const result = await extractIneFields(parsedRequest.data.imageBase64, parsedRequest.data.mimeType);
    response.json({ fields: sanitizeExtractedFields(result.fields), model: result.model, attempts: result.attempts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible procesar la imagen.";
    response.status(503).json({ error: message });
  }
});

app.use(express.static(CLIENT_DIST_DIR));
app.use((_request, response) => {
  response.sendFile("index.html", { root: CLIENT_DIST_DIR });
});

app.listen(PORT, () => {
  console.log(`Beneficiarios server listening on port ${PORT}`);
});

async function extractIneFields(imageBase64: string, mimeType: string) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY ?? "");
  const cleanedBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  const failures: string[] = [];
  let attempts = 0;

  for (const modelName of primaryModels) {
    for (let retry = 0; retry < 2; retry += 1) {
      attempts += 1;

      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
          },
        });

        const result = await model.generateContent([
          {
            inlineData: {
              data: cleanedBase64,
              mimeType,
            },
          },
          OCR_PROMPT,
        ]);

        const text = result.response.text();
        return {
          fields: parseGeminiJson(text),
          model: modelName,
          attempts,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`${modelName} intento ${retry + 1}: ${detail}`);

        if (!isRetryableGeminiError(error) && retry === 0) {
          break;
        }

        await delay(650 * attempts);
      }
    }
  }

  throw new Error(`Gemini no pudo extraer la credencial despues de ${attempts} intentos. ${failures.join(" | ")}`);
}

function parseGeminiJson(text: string): ExtractedFields {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("Gemini respondio sin JSON valido.");
  }

  const raw = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as unknown;
  return extractedSchema.parse(raw);
}

function sanitizeExtractedFields(fields: ExtractedFields): ExtractedFields {
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => value !== undefined && value !== ""),
  ) as ExtractedFields;
}

function isRetryableGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|500|502|503|504|overload|unavailable|quota|rate/i.test(message);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const OCR_PROMPT = `
Eres un extractor OCR especializado en credenciales INE mexicanas.
Lee unicamente la imagen enviada y responde solo JSON valido con estas llaves:
{
  "fullName": "NOMBRE COMPLETO EN MAYUSCULAS",
  "curp": "CURP",
  "voterKey": "CLAVE DE ELECTOR",
  "birthDate": "YYYY-MM-DD"
}
Si un dato no aparece o no es confiable, omite esa propiedad por completo.
No agregues explicaciones, markdown ni texto fuera del JSON.
`;
