import type { Timestamp } from "firebase/firestore";

export type DocumentKey = "ineFront" | "ineBack" | "beneficiaryPhoto" | "signedReceipt";

export type OcrFields = {
  fullName?: string;
  curp?: string;
  voterKey?: string;
  birthDate?: string;
};

export type BeneficiaryFormData = OcrFields & {
  phone?: string;
  address?: string;
  notes?: string;
};

export type DriveFileRecord = {
  id: string;
  name: string;
  webViewLink?: string;
};

export type BeneficiaryRecord = BeneficiaryFormData & {
  id: string;
  operatorUid: string;
  operatorEmail?: string;
  folderId?: string;
  folderLink?: string;
  files?: Partial<Record<DocumentKey, DriveFileRecord>>;
  status: "pendiente" | "completado";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type OcrResponse = {
  fields: OcrFields;
  model: string;
  attempts: number;
};
