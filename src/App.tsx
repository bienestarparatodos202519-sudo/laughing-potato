import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  MessageSquareText,
  Phone,
  Play,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UploadCloud,
  XCircle
} from "lucide-react";
import { exportAuditRows } from "./auditExport";
import { buildSmsUri, DEFAULT_GATEWAY_CONFIG, GATEWAY_LABELS, sendWithGateway } from "./gateways";
import { buildContactsFromRecords, importContactsFromFile } from "./importer";
import { extractTemplateVariables, getMissingVariables, insertVariableAtCursor, renderMessage } from "./templating";
import type { AuditRow, ContactRow, DeliveryStatus, GatewayConfig, GatewayType, ImportResult } from "./types";

const TEMPLATE_STORAGE_KEY = "omnisend.template";
const GATEWAY_STORAGE_KEY = "omnisend.gateway";
const AUDIT_STORAGE_KEY = "omnisend.audit";

const DEFAULT_TEMPLATE =
  "Hola {{Nombre}}, tenemos una actualización importante para ti. Responde a este SMS si deseas más información.";

const STATUS_OPTIONS: Array<DeliveryStatus | "Todos"> = ["Todos", "Pendiente", "Enviando", "Entregado", "Error"];

function App() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [phoneColumn, setPhoneColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [template, setTemplate] = useState(() => localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? DEFAULT_TEMPLATE);
  const [gateway, setGateway] = useState<GatewayConfig>(() => readGatewayConfig());
  const [auditRows, setAuditRows] = useState<AuditRow[]>(() => readAuditRows());
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | "Todos">("Todos");
  const [query, setQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [nativeIndex, setNativeIndex] = useState(0);
  const [notice, setNotice] = useState("");

  const columns = importResult?.analysis.columns ?? [];
  const variables = useMemo(() => extractTemplateVariables(template), [template]);
  const missingVariables = useMemo(() => getMissingVariables(template, columns), [template, columns]);
  const previewContact = contacts[0];
  const previewMessage = previewContact ? renderMessage(template, previewContact) : template;
  const pendingNativeContacts = useMemo(
    () => contacts.filter((contact) => contact.status === "Pendiente" || contact.status === "Error"),
    [contacts]
  );
  const nativeContact = pendingNativeContacts[nativeIndex] ?? pendingNativeContacts[0];

  const filteredAuditRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return auditRows.filter((row) => {
      const matchesStatus = statusFilter === "Todos" || row.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        [row.name, row.phone, row.message, row.error ?? "", row.providerId ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [auditRows, query, statusFilter]);

  const statusCounts = useMemo(() => {
    return contacts.reduce<Record<DeliveryStatus, number>>(
      (accumulator, contact) => {
        accumulator[contact.status] += 1;
        return accumulator;
      },
      { Pendiente: 0, Enviando: 0, Entregado: 0, Error: 0 }
    );
  }, [contacts]);

  useEffect(() => {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, template);
  }, [template]);

  useEffect(() => {
    localStorage.setItem(GATEWAY_STORAGE_KEY, JSON.stringify(gateway));
  }, [gateway]);

  useEffect(() => {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditRows.slice(0, 2000)));
  }, [auditRows]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImporting(true);
    setNotice("");

    try {
      const result = await importContactsFromFile(file);
      setImportResult(result);
      setContacts(result.contacts);
      setPhoneColumn(result.analysis.phoneColumn ?? "");
      setNameColumn(result.analysis.nameColumn ?? "");
      setNativeIndex(0);
      setNotice(`Archivo importado: ${result.contacts.length} contacto(s) listos desde ${file.name}.`);
    } catch (error) {
      setNotice(`No se pudo importar el archivo: ${getErrorMessage(error)}`);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  function handleRemap(nextPhoneColumn = phoneColumn, nextNameColumn = nameColumn) {
    if (!importResult) {
      return;
    }

    const remapped = buildContactsFromRecords(importResult.sourceRows, nextPhoneColumn, nextNameColumn || undefined);
    setContacts(remapped);
    setPhoneColumn(nextPhoneColumn);
    setNameColumn(nextNameColumn);
    setNativeIndex(0);
    setNotice(`${remapped.length} contacto(s) reconstruidos con el mapeo seleccionado.`);
  }

  function insertVariable(column: string) {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? template.length;
    const selectionEnd = textarea?.selectionEnd ?? template.length;
    const result = insertVariableAtCursor(template, column, selectionStart, selectionEnd);

    setTemplate(result.value);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  async function sendBatch() {
    if (gateway.type === "native") {
      setNotice("Usa el asistente de SMS nativo para abrir cada mensaje desde el teléfono.");
      return;
    }

    const queue = contacts.filter((contact) => contact.status === "Pendiente" || contact.status === "Error");
    if (queue.length === 0) {
      setNotice("No hay contactos pendientes para enviar.");
      return;
    }

    setIsSending(true);
    setNotice(`Enviando ${queue.length} SMS por ${GATEWAY_LABELS[gateway.type]}...`);

    for (const contact of queue) {
      const message = renderMessage(template, contact);
      updateContact(contact.id, { status: "Enviando", lastMessage: message, error: undefined });

      try {
        const result = await sendWithGateway({ phone: contact.phone, message, contact, config: gateway });
        const status: DeliveryStatus = result.ok ? "Entregado" : "Error";
        const sentAt = new Date().toISOString();
        updateContact(contact.id, {
          status,
          lastMessage: message,
          error: result.error,
          sentAt
        });
        appendAudit({
          id: crypto.randomUUID(),
          phone: contact.phone,
          name: contact.name,
          status,
          gateway: gateway.type,
          message,
          providerId: result.providerId,
          error: result.error,
          sentAt
        });
      } catch (error) {
        const sentAt = new Date().toISOString();
        const messageError = getErrorMessage(error);
        updateContact(contact.id, {
          status: "Error",
          lastMessage: message,
          error: messageError,
          sentAt
        });
        appendAudit({
          id: crypto.randomUUID(),
          phone: contact.phone,
          name: contact.name,
          status: "Error",
          gateway: gateway.type,
          message,
          error: messageError,
          sentAt
        });
      }
    }

    setIsSending(false);
    setNotice("Proceso de envío finalizado. Revisa la bitácora para detalles.");
  }

  function openNativeSms() {
    if (!nativeContact) {
      setNotice("No hay contactos pendientes para el modo nativo.");
      return;
    }

    const message = renderMessage(template, nativeContact);
    updateContact(nativeContact.id, { status: "Enviando", lastMessage: message, error: undefined });
    window.location.href = buildSmsUri(nativeContact.phone, message);
  }

  function completeNative(status: "Entregado" | "Error") {
    if (!nativeContact) {
      return;
    }

    const message = nativeContact.lastMessage || renderMessage(template, nativeContact);
    const sentAt = new Date().toISOString();
    updateContact(nativeContact.id, {
      status,
      sentAt,
      error: status === "Error" ? "Marcado manualmente como error." : undefined
    });
    appendAudit({
      id: crypto.randomUUID(),
      phone: nativeContact.phone,
      name: nativeContact.name,
      status,
      gateway: "native",
      message,
      error: status === "Error" ? "Marcado manualmente como error." : undefined,
      sentAt
    });
    setNativeIndex((current) => Math.min(current + 1, Math.max(0, pendingNativeContacts.length - 2)));
  }

  function updateContact(id: string, patch: Partial<ContactRow>) {
    setContacts((current) => current.map((contact) => (contact.id === id ? { ...contact, ...patch } : contact)));
  }

  function appendAudit(row: AuditRow) {
    setAuditRows((current) => [row, ...current]);
  }

  function updateGateway(patch: Partial<GatewayConfig>) {
    setGateway((current) => ({ ...current, ...patch }));
  }

  return (
    <main className="app-shell">
      <section className="hero panel">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={16} /> PWA premium para PC, Android y web
          </div>
          <h1>OmniSend Masivo</h1>
          <p>
            Importa contactos desde Excel o CSV, detecta teléfonos automáticamente, personaliza mensajes con variables
            y envía por gateway o SMS nativo celular en un flujo guiado.
          </p>
          <div className="hero-actions">
            <label className="primary-action">
              <UploadCloud size={18} />
              {isImporting ? "Importando..." : "Importar Excel / CSV"}
              <input type="file" accept=".xlsx,.csv" onChange={handleFileChange} disabled={isImporting} />
            </label>
            <button className="ghost-action" onClick={() => exportAuditRows(auditRows)} disabled={auditRows.length === 0}>
              <Download size={18} /> Exportar bitácora
            </button>
          </div>
        </div>
        <div className="hero-card">
          <ShieldCheck size={28} />
          <strong>Datos locales</strong>
          <span>La importación, plantillas e historial se procesan en el navegador. Las credenciales solo se usan al enviar.</span>
        </div>
      </section>

      {notice && <div className="notice">{notice}</div>}

      <section className="stats-grid">
        <Metric label="Contactos" value={contacts.length.toString()} icon={<FileSpreadsheet size={20} />} />
        <Metric label="Pendientes" value={statusCounts.Pendiente.toString()} icon={<MessageSquareText size={20} />} />
        <Metric label="Entregados" value={statusCounts.Entregado.toString()} icon={<CheckCircle2 size={20} />} />
        <Metric label="Errores" value={statusCounts.Error.toString()} icon={<XCircle size={20} />} />
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <PanelHeader
            icon={<FileSpreadsheet size={20} />}
            title="1. Importación inteligente"
            subtitle="Autodetección de teléfono y nombre por encabezados y patrones."
          />

          {!importResult ? (
            <div className="drop-zone">
              <UploadCloud size={38} />
              <strong>Selecciona un archivo .xlsx o .csv</strong>
              <span>La primera fila se usa como encabezado. Puedes corregir el mapeo después.</span>
            </div>
          ) : (
            <>
              <div className="analysis-card">
                <strong>{importResult.fileName}</strong>
                <span>
                  Teléfono: {phoneColumn || "sin detectar"} ({importResult.analysis.phoneConfidence}% confianza)
                </span>
                <span>
                  Nombre: {nameColumn || "opcional"} ({importResult.analysis.nameConfidence}% confianza)
                </span>
                {importResult.analysis.warnings.map((warning) => (
                  <small key={warning}>{warning}</small>
                ))}
              </div>

              <div className="mapping-grid">
                <label>
                  Columna teléfono
                  <select value={phoneColumn} onChange={(event) => handleRemap(event.target.value, nameColumn)}>
                    <option value="">Seleccionar</option>
                    {columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Columna nombre
                  <select value={nameColumn} onChange={(event) => handleRemap(phoneColumn, event.target.value)}>
                    <option value="">Sin nombre</option>
                    {columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="table-shell compact">
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.slice(0, 6).map((contact) => (
                      <tr key={contact.id}>
                        <td>{contact.name || "Sin nombre"}</td>
                        <td>{contact.phone}</td>
                        <td>
                          <StatusBadge status={contact.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <PanelHeader
            icon={<MessageSquareText size={20} />}
            title="2. Mensaje con variables"
            subtitle="Usa tokens {{Columna}}. Los valores nulos se convierten en texto vacío."
          />

          <textarea
            ref={textareaRef}
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            rows={7}
            placeholder="Escribe tu SMS..."
          />

          <div className="chips">
            {columns.map((column) => (
              <button key={column} type="button" onClick={() => insertVariable(column)}>
                {`{{${column}}}`}
              </button>
            ))}
          </div>

          <div className="template-meta">
            <span>{template.length} caracteres</span>
            <span>{variables.length} variable(s)</span>
            {missingVariables.length > 0 && <strong>Variables no encontradas: {missingVariables.join(", ")}</strong>}
          </div>

          <div className="preview-card">
            <span>Vista previa</span>
            <p>{previewMessage}</p>
          </div>
        </div>

        <div className="panel">
          <PanelHeader
            icon={<Settings2 size={20} />}
            title="3. Gateway dinámico"
            subtitle="Elige simulación, proveedor SMS, webhook o asistente celular nativo."
          />

          <div className="gateway-tabs">
            {(Object.keys(GATEWAY_LABELS) as GatewayType[]).map((type) => (
              <button
                key={type}
                className={gateway.type === type ? "active" : ""}
                type="button"
                onClick={() => updateGateway({ type })}
              >
                {GATEWAY_LABELS[type]}
              </button>
            ))}
          </div>

          <GatewaySettings gateway={gateway} updateGateway={updateGateway} />

          {gateway.type !== "native" ? (
            <button className="send-button" onClick={sendBatch} disabled={isSending || contacts.length === 0 || !template.trim()}>
              {isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              {isSending ? "Enviando..." : "Enviar lote secuencial"}
            </button>
          ) : (
            <NativeSmsGuide
              contact={nativeContact}
              total={pendingNativeContacts.length}
              current={Math.min(nativeIndex + 1, pendingNativeContacts.length)}
              onOpen={openNativeSms}
              onDone={() => completeNative("Entregado")}
              onError={() => completeNative("Error")}
            />
          )}
        </div>
      </section>

      <section className="panel audit-panel">
        <PanelHeader
          icon={<History size={20} />}
          title="4. Historial de auditoría"
          subtitle="Busca, filtra por estado y exporta la bitácora procesada."
        />

        <div className="audit-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, teléfono, mensaje o error"
            />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DeliveryStatus | "Todos")}>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button onClick={() => exportAuditRows(filteredAuditRows)} disabled={filteredAuditRows.length === 0}>
            <Download size={16} /> Exportar XLSX
          </button>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Contacto</th>
                <th>Gateway</th>
                <th>Estado</th>
                <th>Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {filteredAuditRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    Aún no hay eventos de envío.
                  </td>
                </tr>
              ) : (
                filteredAuditRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.sentAt ? new Date(row.sentAt).toLocaleString() : "-"}</td>
                    <td>
                      <strong>{row.name || "Sin nombre"}</strong>
                      <span>{row.phone}</span>
                    </td>
                    <td>{GATEWAY_LABELS[row.gateway]}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      <span>{row.message}</span>
                      {row.error && <small>{row.error}</small>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

type HeaderProps = {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
};

function PanelHeader({ icon, title, subtitle }: HeaderProps) {
  return (
    <header className="panel-header">
      <div>{icon}</div>
      <span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </span>
    </header>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="metric panel">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GatewaySettings({
  gateway,
  updateGateway
}: {
  gateway: GatewayConfig;
  updateGateway: (patch: Partial<GatewayConfig>) => void;
}) {
  if (gateway.type === "simulator") {
    return <p className="helper">Simula entregas con baja tasa de error para validar plantillas e historial sin costo.</p>;
  }

  if (gateway.type === "native") {
    return (
      <p className="helper">
        Abre el compositor SMS del dispositivo usando esquemas <code>sms:</code>. El usuario confirma cada envío desde su
        app de mensajes.
      </p>
    );
  }

  if (gateway.type === "twilio") {
    return (
      <div className="settings-grid">
        <TextField label="Account SID" value={gateway.twilioAccountSid} onChange={(value) => updateGateway({ twilioAccountSid: value })} />
        <TextField
          label="Auth Token"
          type="password"
          value={gateway.twilioAuthToken}
          onChange={(value) => updateGateway({ twilioAuthToken: value })}
        />
        <TextField
          label="Messaging Service SID (opcional)"
          value={gateway.twilioMessagingServiceSid}
          onChange={(value) => updateGateway({ twilioMessagingServiceSid: value })}
        />
        <TextField label="From / Remitente" value={gateway.sender} onChange={(value) => updateGateway({ sender: value })} />
      </div>
    );
  }

  if (gateway.type === "vonage") {
    return (
      <div className="settings-grid">
        <TextField label="API Key" value={gateway.vonageApiKey} onChange={(value) => updateGateway({ vonageApiKey: value })} />
        <TextField
          label="API Secret"
          type="password"
          value={gateway.vonageApiSecret}
          onChange={(value) => updateGateway({ vonageApiSecret: value })}
        />
        <TextField label="Remitente" value={gateway.sender} onChange={(value) => updateGateway({ sender: value })} />
      </div>
    );
  }

  return (
    <div className="settings-grid single">
      <TextField label="URL webhook" value={gateway.webhookUrl} onChange={(value) => updateGateway({ webhookUrl: value })} />
      <label>
        Método
        <select
          value={gateway.webhookMethod}
          onChange={(event) => updateGateway({ webhookMethod: event.target.value as "POST" | "PUT" })}
        >
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
        </select>
      </label>
      <label>
        Headers JSON
        <textarea value={gateway.webhookHeaders} onChange={(event) => updateGateway({ webhookHeaders: event.target.value })} rows={4} />
      </label>
      <label>
        Body con variables
        <textarea value={gateway.webhookBody} onChange={(event) => updateGateway({ webhookBody: event.target.value })} rows={6} />
      </label>
    </div>
  );
}

function TextField({
  label,
  value,
  type = "text",
  onChange
}: {
  label: string;
  value: string;
  type?: "text" | "password";
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NativeSmsGuide({
  contact,
  total,
  current,
  onOpen,
  onDone,
  onError
}: {
  contact?: ContactRow;
  total: number;
  current: number;
  onOpen: () => void;
  onDone: () => void;
  onError: () => void;
}) {
  return (
    <div className="native-guide">
      <div className="phone-frame">
        <Smartphone size={24} />
        <strong>{contact ? contact.name || contact.phone : "Sin contactos pendientes"}</strong>
        <span>
          {total > 0 ? `${current} de ${total}` : "Carga contactos o reinicia estados para continuar"}
        </span>
      </div>
      <div className="native-actions">
        <button className="send-button" onClick={onOpen} disabled={!contact}>
          <Phone size={18} /> Abrir SMS
        </button>
        <button onClick={onDone} disabled={!contact}>
          <CheckCircle2 size={16} /> Marcar enviado
        </button>
        <button onClick={onError} disabled={!contact}>
          <XCircle size={16} /> Error
        </button>
      </div>
      <p className="helper">
        Android usa <code>sms:phone?body=texto</code> e iOS <code>sms:phone;body=texto</code>. Después de enviar,
        vuelve a OmniSend y marca el resultado para avanzar.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}>{status}</span>;
}

function readGatewayConfig(): GatewayConfig {
  try {
    return {
      ...DEFAULT_GATEWAY_CONFIG,
      ...JSON.parse(localStorage.getItem(GATEWAY_STORAGE_KEY) ?? "{}")
    };
  } catch {
    return DEFAULT_GATEWAY_CONFIG;
  }
}

function readAuditRows(): AuditRow[] {
  try {
    const rows = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) ?? "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export default App;
