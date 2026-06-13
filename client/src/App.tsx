import { useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import {
  BadgeCheck,
  Cloud,
  Download,
  ExternalLink,
  FileCheck2,
  FolderOpen,
  Loader2,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { downloadExcelCsv } from "./lib/csv";
import {
  createBeneficiaryFolder,
  documentLabels,
  requiredDocumentKeys,
  uploadBeneficiaryDocuments,
} from "./lib/drive";
import {
  auth,
  db,
  getCachedDriveAccessToken,
  isFirebaseConfigured,
  missingFirebaseKeys,
  signInWithGoogleDrive,
  signOut,
} from "./lib/firebase";
import { sanitizeForFirestore } from "./lib/firestore";
import { runIneOcr } from "./lib/ocr";
import type { BeneficiaryFormData, BeneficiaryRecord, DocumentKey } from "./types";

const emptyForm: BeneficiaryFormData = {
  fullName: "",
  curp: "",
  voterKey: "",
  birthDate: "",
  phone: "",
  address: "",
  notes: "",
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(() => getCachedDriveAccessToken());
  const [authLoading, setAuthLoading] = useState(true);
  const [records, setRecords] = useState<BeneficiaryRecord[]>([]);
  const [form, setForm] = useState<BeneficiaryFormData>(emptyForm);
  const [documents, setDocuments] = useState<Partial<Record<DocumentKey, File>>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [ocrState, setOcrState] = useState<"idle" | "running" | "done">("idle");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setRecords([]);
      return;
    }

    const beneficiariesQuery = query(collection(db, "beneficiaries"), where("operatorUid", "==", user.uid));
    return onSnapshot(
      beneficiariesQuery,
      (snapshot) => {
        const nextRecords = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as BeneficiaryRecord)
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setRecords(nextRecords);
      },
      (error) => setErrorMessage(getFirebaseMessage(error)),
    );
  }, [user]);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch =
        !normalizedSearch ||
        [record.fullName, record.curp, record.voterKey, record.phone]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedSearch));

      const createdDate = record.createdAt?.toDate().toISOString().slice(0, 10);
      const matchesDate = !dateFilter || createdDate === dateFilter;
      return matchesSearch && matchesDate;
    });
  }, [dateFilter, records, searchTerm]);

  const folderStats = useMemo(() => {
    const withFolder = records.filter((record) => Boolean(record.folderId)).length;
    const completed = records.filter((record) =>
      requiredDocumentKeys.every((key) => Boolean(record.files?.[key]?.id)),
    ).length;
    return { withFolder, completed };
  }, [records]);

  const allDocumentsReady = requiredDocumentKeys.every((key) => documents[key]);

  async function handleLogin() {
    setErrorMessage("");
    setStatusMessage("Solicitando acceso seguro a Google Drive...");

    try {
      const result = await signInWithGoogleDrive();
      setUser(result.user);
      setDriveToken(result.accessToken);
      setStatusMessage("Sesion iniciada y permiso drive.file autorizado.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setStatusMessage("");
    }
  }

  async function handleDocumentChange(key: DocumentKey, file?: File) {
    if (!file) {
      return;
    }

    setDocuments((current) => ({ ...current, [key]: file }));
    setErrorMessage("");

    if (key !== "ineFront") {
      return;
    }

    setOcrState("running");
    setStatusMessage("Leyendo INE frente con OCR inteligente...");

    try {
      const result = await runIneOcr(file);
      setForm((current) => ({
        ...current,
        ...result.fields,
      }));
      setOcrState("done");
      setStatusMessage(`OCR completado con ${result.model} en ${result.attempts} intento(s).`);
    } catch (error) {
      setOcrState("idle");
      setErrorMessage(getErrorMessage(error));
      setStatusMessage("");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!user || !db) {
      setErrorMessage("Inicia sesion con Google antes de guardar.");
      return;
    }

    if (!driveToken) {
      setErrorMessage("Vuelve a iniciar sesion para renovar el permiso temporal de Google Drive.");
      return;
    }

    if (!form.fullName?.trim()) {
      setErrorMessage("El nombre completo es obligatorio para nombrar la carpeta.");
      return;
    }

    if (!allDocumentsReady) {
      setErrorMessage("Adjunta los 4 documentos requeridos antes de guardar.");
      return;
    }

    setSaving(true);
    setStatusMessage("Creando carpeta y subiendo expediente a Google Drive...");

    try {
      const folder = await createBeneficiaryFolder(driveToken, form.fullName);
      const files = await uploadBeneficiaryDocuments(
        driveToken,
        folder.id,
        form.fullName,
        documents as Record<DocumentKey, File>,
      );
      const folderLink = folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`;

      await addDoc(collection(db, "beneficiaries"), {
        ...sanitizeForFirestore(form),
        operatorUid: user.uid,
        operatorEmail: user.email ?? undefined,
        folderId: folder.id,
        folderLink,
        files,
        status: "completado",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(emptyForm);
      setDocuments({});
      setOcrState("idle");
      setStatusMessage("Registro guardado con carpeta sincronizada en Google Drive.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setStatusMessage("");
    } finally {
      setSaving(false);
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <ShellLayout>
        <ConfigWarning missingKeys={missingFirebaseKeys} />
      </ShellLayout>
    );
  }

  if (authLoading) {
    return (
      <ShellLayout>
        <div className="flex min-h-[70vh] items-center justify-center text-slate-100">
          <Loader2 className="mr-3 h-6 w-6 animate-spin text-sky-300" />
          Preparando autenticacion segura...
        </div>
      </ShellLayout>
    );
  }

  if (!user) {
    return (
      <ShellLayout>
        <section className="mx-auto flex min-h-[75vh] max-w-4xl flex-col items-center justify-center text-center">
          <div className="mb-6 rounded-full border border-sky-300/30 bg-sky-300/10 p-4 text-sky-200">
            <ShieldCheck className="h-12 w-12" />
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-sky-300">
            Google OAuth + Firebase
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
            Expedientes ciudadanos sincronizados con Drive personal.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            Inicia sesion con Google para autenticar al operador, solicitar el alcance drive.file y habilitar la
            creacion segura de carpetas y archivos en su propio espacio de Google Drive.
          </p>
          <button
            className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-sky-400 px-6 py-4 font-bold text-slate-950 shadow-2xl shadow-sky-500/30 transition hover:bg-sky-300"
            onClick={handleLogin}
          >
            <Cloud className="h-5 w-5" />
            Entrar con Google y autorizar Drive
          </button>
          <StatusBanner status={statusMessage} error={errorMessage} />
        </section>
      </ShellLayout>
    );
  }

  return (
    <ShellLayout>
      <header className="mb-8 flex flex-col gap-5 rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-slate-950/50 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">Panel operativo</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">
            Registro de beneficiarios
          </h1>
          <p className="mt-3 text-slate-300">
            {user.email} - token OAuth temporal activo para escritura segura con drive.file.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-2xl border border-white/15 px-4 py-3 font-semibold text-slate-100 transition hover:bg-white/10"
            onClick={handleLogin}
          >
            Renovar permiso Drive
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 font-semibold text-slate-950 transition hover:bg-slate-200"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>
      </header>

      <main className="grid gap-6 xl:grid-cols-[1.15fr_1fr_0.85fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-slate-950/40">
          <SectionTitle icon={<Sparkles />} title="Captura, OCR y validacion" />
          <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Nombre completo" value={form.fullName} onChange={(fullName) => setFormField({ fullName })} />
              <TextField label="CURP" value={form.curp} onChange={(curp) => setFormField({ curp: curp.toUpperCase() })} />
              <TextField
                label="Clave de elector"
                value={form.voterKey}
                onChange={(voterKey) => setFormField({ voterKey: voterKey.toUpperCase() })}
              />
              <TextField
                label="Fecha de nacimiento"
                type="date"
                value={form.birthDate}
                onChange={(birthDate) => setFormField({ birthDate })}
              />
              <TextField label="Telefono" value={form.phone} onChange={(phone) => setFormField({ phone })} />
              <TextField label="Direccion" value={form.address} onChange={(address) => setFormField({ address })} />
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">Notas</span>
              <textarea
                className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300"
                placeholder="Observaciones del expediente"
                value={form.notes ?? ""}
                onChange={(event) => setFormField({ notes: event.target.value })}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              {requiredDocumentKeys.map((key) => (
                <FileInput
                  key={key}
                  label={documentLabels[key]}
                  file={documents[key]}
                  highlight={key === "ineFront"}
                  onChange={(file) => void handleDocumentChange(key, file)}
                />
              ))}
            </div>

            <StatusBanner status={statusMessage} error={errorMessage} />

            <button
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-400 px-5 py-4 text-lg font-black text-slate-950 shadow-xl shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving || ocrState === "running"}
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderOpen className="h-5 w-5" />}
              Guardar registro y sincronizar Drive
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-slate-950/40">
          <SectionTitle icon={<FileCheck2 />} title="Expedientes registrados" />
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 py-3 pl-11 pr-4 text-slate-100 outline-none focus:border-sky-300"
                placeholder="Buscar por nombre, CURP, INE o telefono"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <input
              className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-100 outline-none focus:border-sky-300"
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
          </div>
          <button
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-300/40 bg-sky-300/10 px-4 py-3 font-bold text-sky-100 transition hover:bg-sky-300/20"
            onClick={() => downloadExcelCsv(filteredRecords)}
          >
            <Download className="h-4 w-4" />
            Descargar Excel ({filteredRecords.length})
          </button>

          <div className="mt-5 space-y-3">
            {filteredRecords.length === 0 ? (
              <EmptyState text="No hay expedientes con los filtros actuales." />
            ) : (
              filteredRecords.map((record) => <BeneficiaryCard key={record.id} record={record} />)
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-slate-950/40">
            <SectionTitle icon={<FolderOpen />} title="Drive sincronizado" />
            <div className="mt-5 grid gap-3">
              <MetricCard label="Carpetas validas" value={folderStats.withFolder} />
              <MetricCard label="Completadas con 4 archivos" value={folderStats.completed} accent />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-slate-950/40">
            <SectionTitle icon={<BadgeCheck />} title="Directorios recientes" />
            <div className="mt-5 space-y-3">
              {records.filter((record) => record.folderLink).length === 0 ? (
                <EmptyState text="Las carpetas apareceran al guardar expedientes." />
              ) : (
                records
                  .filter((record) => record.folderLink)
                  .slice(0, 8)
                  .map((record) => (
                    <a
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-200 transition hover:border-sky-300/60 hover:bg-sky-300/10"
                      href={record.folderLink}
                      key={record.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="line-clamp-1">{record.fullName}</span>
                      <ExternalLink className="ml-3 h-4 w-4 shrink-0 text-sky-300" />
                    </a>
                  ))
              )}
            </div>
          </section>
        </aside>
      </main>
    </ShellLayout>
  );

  function setFormField(update: Partial<BeneficiaryFormData>) {
    setForm((current) => ({ ...current, ...update }));
  }
}

function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1e3a8a_0,#0f172a_42%,#020617_100%)] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl">{children}</div>
    </div>
  );
}

function ConfigWarning({ missingKeys }: { missingKeys: string[] }) {
  return (
    <div className="mx-auto mt-16 max-w-3xl rounded-[2rem] border border-amber-300/40 bg-amber-300/10 p-8 text-amber-50">
      <h1 className="text-3xl font-black">Faltan variables de Firebase</h1>
      <p className="mt-3 text-amber-100">
        Configura el archivo `.env` con las llaves publicas del proyecto Firebase para habilitar Authentication y
        Firestore.
      </p>
      <pre className="mt-5 overflow-auto rounded-2xl bg-slate-950/80 p-4 text-sm">
        {missingKeys.map((key) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`).join("\n")}
      </pre>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-2xl bg-sky-300/10 p-3 text-sky-300">{icon}</div>
      <h2 className="text-xl font-black text-white">{title}</h2>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-200">{label}</span>
      <input
        className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300"
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FileInput({
  label,
  file,
  highlight,
  onChange,
}: {
  label: string;
  file?: File;
  highlight?: boolean;
  onChange: (file?: File) => void;
}) {
  return (
    <label
      className={`block rounded-2xl border border-dashed p-4 transition ${
        highlight ? "border-sky-300/60 bg-sky-300/10" : "border-white/15 bg-slate-950/40"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-bold text-slate-100">
        <UploadCloud className="h-4 w-4 text-sky-300" />
        {label}
      </span>
      <input
        accept="image/*,.pdf"
        className="mt-3 w-full text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold file:text-slate-950"
        type="file"
        onChange={(event) => onChange(event.target.files?.[0])}
      />
      <span className="mt-2 block text-xs text-slate-400">{file ? file.name : "Pendiente"}</span>
    </label>
  );
}

function StatusBanner({ status, error }: { status: string; error: string }) {
  if (!status && !error) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border p-4 text-sm ${
        error ? "border-rose-300/40 bg-rose-400/10 text-rose-100" : "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
      }`}
    >
      {error || status}
    </div>
  );
}

function BeneficiaryCard({ record }: { record: BeneficiaryRecord }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-black text-white">{record.fullName || "Beneficiario sin nombre"}</h3>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">CURP: {record.curp || "Sin dato"}</p>
          <p className="text-xs uppercase tracking-wider text-slate-400">INE: {record.voterKey || "Sin dato"}</p>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
          {record.status}
        </span>
      </div>
      {record.folderLink ? (
        <a
          className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-sky-300 hover:text-sky-200"
          href={record.folderLink}
          rel="noreferrer"
          target="_blank"
        >
          Abrir carpeta Drive
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
    </article>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-emerald-300/30 bg-emerald-400/10" : "border-white/10 bg-slate-950/50"}`}>
      <p className="text-sm font-semibold text-slate-300">{label}</p>
      <p className="mt-2 text-4xl font-black text-white">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 text-center text-sm text-slate-400">{text}</div>;
}

function getFirebaseMessage(error: FirebaseError) {
  if (error.code === "permission-denied") {
    return "Firestore rechazo la lectura. Revisa las reglas de seguridad para el operador autenticado.";
  }

  return error.message;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}
