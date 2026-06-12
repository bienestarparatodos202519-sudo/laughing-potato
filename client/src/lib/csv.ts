import type { BeneficiaryRecord } from "../types";

const columns: Array<[string, (record: BeneficiaryRecord) => string | undefined]> = [
  ["Nombre completo", (record) => record.fullName],
  ["CURP", (record) => record.curp],
  ["Clave de elector", (record) => record.voterKey],
  ["Fecha de nacimiento", (record) => record.birthDate],
  ["Telefono", (record) => record.phone],
  ["Direccion", (record) => record.address],
  ["Estatus", (record) => record.status],
  ["Carpeta Drive", (record) => record.folderId],
  ["Enlace Drive", (record) => record.folderLink],
  ["Fecha de captura", (record) => record.createdAt?.toDate().toLocaleString("es-MX")],
];

export function downloadExcelCsv(records: BeneficiaryRecord[]) {
  const rows = [
    columns.map(([label]) => label),
    ...records.map((record) => columns.map(([, getter]) => getter(record) ?? "")),
  ];

  const csvBody = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const csv = `\uFEFFsep=,\n${csvBody}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `beneficiarios-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}
