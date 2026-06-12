import Papa from "papaparse";
import readXlsxFile from "read-excel-file";
import type { ContactRow, ImportAnalysis, ImportResult } from "./types";

const PHONE_HEADER_HINTS = [
  "phone",
  "telefono",
  "teléfono",
  "tel",
  "mobile",
  "movil",
  "móvil",
  "cel",
  "celular",
  "whatsapp",
  "numero",
  "número",
  "msisdn"
];

const NAME_HEADER_HINTS = [
  "name",
  "nombre",
  "contacto",
  "cliente",
  "persona",
  "full name",
  "fullname",
  "first name",
  "apellido"
];

const EMAIL_HINT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Matrix = Array<Array<string>>;

export async function importContactsFromFile(file: File): Promise<ImportResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const matrix = extension === "csv" ? await readCsv(file) : await readXlsx(file);
  const { columns, records } = matrixToRecords(matrix);
  const analysis = analyzeColumns(columns, records);

  if (!analysis.phoneColumn) {
    analysis.warnings.push("No se detectó una columna de teléfono con suficiente confianza.");
  }

  const contacts = buildContactsFromRecords(records, analysis.phoneColumn, analysis.nameColumn);

  if (contacts.length !== records.length) {
    analysis.warnings.push(
      `${records.length - contacts.length} fila(s) se omitieron porque no tenían un teléfono válido.`
    );
  }

  return {
    fileName: file.name,
    sourceRows: records,
    contacts,
    analysis
  };
}

export function buildContactsFromRecords(
  records: Array<Record<string, string>>,
  phoneColumn?: string,
  nameColumn?: string
): ContactRow[] {
  if (!phoneColumn) {
    return [];
  }

  return records
    .map((values, index) => {
      const phone = normalizePhone(values[phoneColumn] ?? "");
      if (!phone) {
        return null;
      }

      return {
        id: crypto.randomUUID(),
        originalIndex: index + 2,
        values,
        phone,
        name: cleanValue(values[nameColumn ?? ""] ?? ""),
        status: "Pendiente" as const
      };
    })
    .filter((contact): contact is ContactRow => Boolean(contact));
}

function analyzeColumns(columns: string[], records: Array<Record<string, string>>): ImportAnalysis {
  const phoneScores = columns.map((column) => ({
    column,
    score: scorePhoneColumn(column, records)
  }));
  const nameScores = columns.map((column) => ({
    column,
    score: scoreNameColumn(column, records)
  }));

  phoneScores.sort((a, b) => b.score - a.score);
  nameScores.sort((a, b) => b.score - a.score);

  const bestPhone = phoneScores[0];
  const bestName = nameScores.find((candidate) => candidate.column !== bestPhone?.column);
  const warnings: string[] = [];

  if (columns.length === 0) {
    warnings.push("El archivo no contiene encabezados detectables.");
  }

  return {
    columns,
    phoneColumn: bestPhone && bestPhone.score >= 35 ? bestPhone.column : undefined,
    nameColumn: bestName && bestName.score >= 20 ? bestName.column : undefined,
    phoneConfidence: Math.min(100, Math.round(bestPhone?.score ?? 0)),
    nameConfidence: Math.min(100, Math.round(bestName?.score ?? 0)),
    warnings
  };
}

function scorePhoneColumn(column: string, records: Array<Record<string, string>>): number {
  const normalizedHeader = normalizeHeader(column);
  const headerScore = PHONE_HEADER_HINTS.some((hint) => normalizedHeader.includes(hint)) ? 45 : 0;
  const sample = records.slice(0, 50).map((record) => record[column]);
  const validCount = sample.filter((value) => Boolean(normalizePhone(value))).length;
  const ratioScore = sample.length > 0 ? (validCount / sample.length) * 55 : 0;

  return headerScore + ratioScore;
}

function scoreNameColumn(column: string, records: Array<Record<string, string>>): number {
  const normalizedHeader = normalizeHeader(column);
  const headerScore = NAME_HEADER_HINTS.some((hint) => normalizedHeader.includes(hint)) ? 50 : 0;
  const sample = records.slice(0, 50).map((record) => cleanValue(record[column]));
  const plausibleCount = sample.filter(
    (value) => value.length >= 2 && !normalizePhone(value) && !EMAIL_HINT.test(value) && /[a-záéíóúñ]/i.test(value)
  ).length;
  const ratioScore = sample.length > 0 ? (plausibleCount / sample.length) * 40 : 0;

  return headerScore + ratioScore;
}

function matrixToRecords(matrix: Matrix): { columns: string[]; records: Array<Record<string, string>> } {
  const [rawHeaders = [], ...rows] = matrix.filter((row) => row.some((cell) => cleanValue(cell)));
  const columns = rawHeaders.map((header, index) => cleanHeader(header, index));
  const seen = new Map<string, number>();
  const uniqueColumns = columns.map((column) => {
    const count = seen.get(column) ?? 0;
    seen.set(column, count + 1);
    return count === 0 ? column : `${column}_${count + 1}`;
  });

  const records = rows.map((row) =>
    uniqueColumns.reduce<Record<string, string>>((record, column, index) => {
      record[column] = cleanValue(row[index]);
      return record;
    }, {})
  );

  return { columns: uniqueColumns, records };
}

function cleanHeader(value: unknown, index: number): string {
  const header = cleanValue(value);
  return header || `Columna ${index + 1}`;
}

function cleanValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export function normalizePhone(value: unknown): string {
  const raw = cleanValue(value);
  if (!raw) {
    return "";
  }

  const hasLeadingPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");

  if (digits.length < 7 || digits.length > 15) {
    return "";
  }

  return `${hasLeadingPlus ? "+" : ""}${digits}`;
}

async function readXlsx(file: File): Promise<Matrix> {
  const rows = await readXlsxFile(file);
  return rows.map((row) => row.map((cell) => cleanValue(cell)));
}

async function readCsv(file: File): Promise<Matrix> {
  const text = await file.text();

  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      complete: (result) => resolve(result.data.map((row) => row.map((cell) => cleanValue(cell)))),
      error: (error: Error) => reject(error)
    });
  });
}
