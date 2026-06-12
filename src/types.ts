export type DeliveryStatus = "Pendiente" | "Enviando" | "Entregado" | "Error";

export type ContactRow = {
  id: string;
  originalIndex: number;
  values: Record<string, string>;
  phone: string;
  name: string;
  status: DeliveryStatus;
  lastMessage?: string;
  error?: string;
  sentAt?: string;
};

export type ImportAnalysis = {
  columns: string[];
  phoneColumn?: string;
  nameColumn?: string;
  phoneConfidence: number;
  nameConfidence: number;
  warnings: string[];
};

export type ImportResult = {
  fileName: string;
  sourceRows: Array<Record<string, string>>;
  contacts: ContactRow[];
  analysis: ImportAnalysis;
};

export type GatewayType = "simulator" | "twilio" | "vonage" | "webhook" | "native";

export type GatewayConfig = {
  type: GatewayType;
  sender: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioMessagingServiceSid: string;
  vonageApiKey: string;
  vonageApiSecret: string;
  webhookUrl: string;
  webhookMethod: "POST" | "PUT";
  webhookHeaders: string;
  webhookBody: string;
};

export type GatewaySendInput = {
  phone: string;
  message: string;
  contact: ContactRow;
  config: GatewayConfig;
};

export type GatewaySendResult = {
  ok: boolean;
  providerId?: string;
  error?: string;
};

export type AuditRow = {
  id: string;
  phone: string;
  name: string;
  status: DeliveryStatus;
  gateway: GatewayType;
  message: string;
  providerId?: string;
  error?: string;
  sentAt?: string;
};
