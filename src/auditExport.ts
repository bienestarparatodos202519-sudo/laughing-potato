import writeXlsxFile from "write-excel-file";
import type { AuditRow } from "./types";

export async function exportAuditRows(rows: AuditRow[]): Promise<void> {
  const schema = [
    {
      column: "Fecha",
      type: String,
      value: (row: AuditRow) => row.sentAt ?? ""
    },
    {
      column: "Nombre",
      type: String,
      value: (row: AuditRow) => row.name
    },
    {
      column: "Telefono",
      type: String,
      value: (row: AuditRow) => row.phone
    },
    {
      column: "Estado",
      type: String,
      value: (row: AuditRow) => row.status
    },
    {
      column: "Gateway",
      type: String,
      value: (row: AuditRow) => row.gateway
    },
    {
      column: "Mensaje",
      type: String,
      value: (row: AuditRow) => row.message
    },
    {
      column: "ID proveedor",
      type: String,
      value: (row: AuditRow) => row.providerId ?? ""
    },
    {
      column: "Error",
      type: String,
      value: (row: AuditRow) => row.error ?? ""
    }
  ];

  await writeXlsxFile(rows, {
    schema,
    fileName: `omnisend-bitacora-${new Date().toISOString().slice(0, 10)}.xlsx`
  });
}
