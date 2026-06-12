import writeXlsxFile from "write-excel-file/browser";
import type { AuditRow } from "./types";

export async function exportAuditRows(rows: AuditRow[]): Promise<void> {
  const columns = [
    {
      header: "Fecha",
      type: String,
      cell: (row: AuditRow) => row.sentAt ?? ""
    },
    {
      header: "Nombre",
      type: String,
      cell: (row: AuditRow) => row.name
    },
    {
      header: "Telefono",
      type: String,
      cell: (row: AuditRow) => row.phone
    },
    {
      header: "Estado",
      type: String,
      cell: (row: AuditRow) => row.status
    },
    {
      header: "Gateway",
      type: String,
      cell: (row: AuditRow) => row.gateway
    },
    {
      header: "Mensaje",
      type: String,
      cell: (row: AuditRow) => row.message
    },
    {
      header: "ID proveedor",
      type: String,
      cell: (row: AuditRow) => row.providerId ?? ""
    },
    {
      header: "Error",
      type: String,
      cell: (row: AuditRow) => row.error ?? ""
    }
  ];

  await writeXlsxFile(rows, { columns }).toFile(
    `omnisend-bitacora-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
