import type { GatewayConfig, GatewaySendInput, GatewaySendResult, GatewayType } from "./types";
import { renderMessage } from "./templating";

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  type: "simulator",
  sender: "OmniSend",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioMessagingServiceSid: "",
  vonageApiKey: "",
  vonageApiSecret: "",
  webhookUrl: "",
  webhookMethod: "POST",
  webhookHeaders: '{\n  "Content-Type": "application/json"\n}',
  webhookBody: '{\n  "to": "{{phone}}",\n  "name": "{{name}}",\n  "message": "{{message}}"\n}'
};

export const GATEWAY_LABELS: Record<GatewayType, string> = {
  simulator: "Simulador",
  twilio: "Twilio",
  vonage: "Vonage",
  webhook: "API Webhook",
  native: "SMS celular nativo"
};

export async function sendWithGateway(input: GatewaySendInput): Promise<GatewaySendResult> {
  switch (input.config.type) {
    case "simulator":
      return sendWithSimulator();
    case "twilio":
      return sendWithTwilio(input);
    case "vonage":
      return sendWithVonage(input);
    case "webhook":
      return sendWithWebhook(input);
    case "native":
      return {
        ok: false,
        error: "El modo nativo se ejecuta mediante enlaces sms: desde la interfaz guiada."
      };
    default:
      return {
        ok: false,
        error: "Gateway no soportado."
      };
  }
}

export function buildSmsUri(phone: string, body: string): string {
  const encodedBody = encodeURIComponent(body);
  const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? ";body=" : "?body=";
  return `sms:${encodeURIComponent(phone)}${separator}${encodedBody}`;
}

async function sendWithSimulator(): Promise<GatewaySendResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 450 + Math.random() * 850));

  if (Math.random() < 0.96) {
    return {
      ok: true,
      providerId: `SIM-${Date.now()}-${Math.floor(Math.random() * 9999)}`
    };
  }

  return {
    ok: false,
    error: "Fallo simulado para validar el flujo de errores."
  };
}

async function sendWithTwilio({ phone, message, config }: GatewaySendInput): Promise<GatewaySendResult> {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    return {
      ok: false,
      error: "Configura Account SID y Auth Token de Twilio."
    };
  }

  const body = new URLSearchParams({
    To: phone,
    Body: message
  });

  if (config.twilioMessagingServiceSid) {
    body.set("MessagingServiceSid", config.twilioMessagingServiceSid);
  } else if (config.sender) {
    body.set("From", config.sender);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioAccountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.twilioAccountSid}:${config.twilioAuthToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );
  const payload = await safeJson(response);

  return {
    ok: response.ok,
    providerId: payload?.sid,
    error: response.ok ? undefined : payload?.message ?? response.statusText
  };
}

async function sendWithVonage({ phone, message, config }: GatewaySendInput): Promise<GatewaySendResult> {
  if (!config.vonageApiKey || !config.vonageApiSecret) {
    return {
      ok: false,
      error: "Configura API Key y API Secret de Vonage."
    };
  }

  const response = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      api_key: config.vonageApiKey,
      api_secret: config.vonageApiSecret,
      from: config.sender || "OmniSend",
      to: phone,
      text: message
    })
  });
  const payload = await safeJson(response);
  const firstMessage = payload?.messages?.[0];
  const status = firstMessage?.status;

  return {
    ok: response.ok && status === "0",
    providerId: firstMessage?.["message-id"],
    error: status === "0" ? undefined : firstMessage?.["error-text"] ?? response.statusText
  };
}

async function sendWithWebhook({ phone, message, contact, config }: GatewaySendInput): Promise<GatewaySendResult> {
  if (!config.webhookUrl) {
    return {
      ok: false,
      error: "Configura la URL del webhook."
    };
  }

  const headers = parseHeaders(config.webhookHeaders);
  const body = renderWebhookBody(config.webhookBody, {
    ...contact.values,
    phone,
    name: contact.name,
    message
  });

  const response = await fetch(config.webhookUrl, {
    method: config.webhookMethod,
    headers,
    body
  });
  const payload = await safeJson(response);

  return {
    ok: response.ok,
    providerId: payload?.id ?? payload?.messageId ?? payload?.sid,
    error: response.ok ? undefined : payload?.error ?? payload?.message ?? response.statusText
  };
}

function renderWebhookBody(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_token, key: string) => values[key.trim()] ?? "");
}

function parseHeaders(raw: string): HeadersInit {
  if (!raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  } catch {
    return {
      "Content-Type": "application/json"
    };
  }
}

async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
