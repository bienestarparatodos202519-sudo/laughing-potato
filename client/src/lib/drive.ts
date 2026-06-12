import type { DocumentKey, DriveFileRecord } from "../types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export type DriveUploadResult = {
  folderId: string;
  folderLink: string;
  files: Record<DocumentKey, DriveFileRecord>;
};

export const documentLabels: Record<DocumentKey, string> = {
  ineFront: "INE Frente",
  ineBack: "INE Reverso",
  beneficiaryPhoto: "Fotografia del beneficiario",
  signedReceipt: "Acuse impreso firmado",
};

export const requiredDocumentKeys = Object.keys(documentLabels) as DocumentKey[];

export async function createBeneficiaryFolder(accessToken: string, beneficiaryName: string) {
  const response = await fetch(`${DRIVE_API}/files?fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: normalizeDriveName(beneficiaryName),
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!response.ok) {
    throw new Error(await getGoogleError(response, "No se pudo crear la carpeta en Google Drive."));
  }

  return (await response.json()) as DriveFileRecord;
}

export async function uploadBeneficiaryDocuments(
  accessToken: string,
  folderId: string,
  beneficiaryName: string,
  documents: Record<DocumentKey, File>,
) {
  const uploaded = {} as Record<DocumentKey, DriveFileRecord>;

  for (const key of requiredDocumentKeys) {
    uploaded[key] = await uploadFile(accessToken, folderId, documents[key], `${beneficiaryName} - ${documentLabels[key]}`);
  }

  return uploaded;
}

async function uploadFile(accessToken: string, folderId: string, file: File, baseName: string) {
  const metadata = {
    name: `${normalizeDriveName(baseName)}${getFileExtension(file.name)}`,
    parents: [folderId],
  };

  const boundary = `beneficiarios_${crypto.randomUUID()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const fileHeader = `${delimiter}Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;

  const body = new Blob([metadataPart, fileHeader, await file.arrayBuffer(), closeDelimiter], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(await getGoogleError(response, `No se pudo subir ${file.name} a Google Drive.`));
  }

  return (await response.json()) as DriveFileRecord;
}

function normalizeDriveName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ") || "Beneficiario sin nombre";
}

function getFileExtension(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex) : "";
}

async function getGoogleError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}
