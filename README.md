# Expedientes de Beneficiarios con Google Drive

Aplicacion full-stack compatible con laptop y Android (PWA) para capturar beneficiarios, leer INE con OCR Gemini,
crear carpetas en el Google Drive personal del operador y registrar los enlaces en Firebase Firestore.

## Arquitectura

- **Frontend:** Vite + React + TypeScript + Tailwind CSS.
- **Backend:** Express + TypeScript con endpoint `/api/ocr`.
- **Autenticacion:** Firebase Authentication con Google OAuth.
- **Base de datos:** Firestore, saneando datos antes de guardar para evitar valores `undefined`.
- **Drive:** Google Drive API con scope `https://www.googleapis.com/auth/drive.file`.
- **OCR:** Gemini con reintentos y fallback de modelos (`gemini-3.5-flash`, `gemini-3.1-flash-lite`).
- **Instalacion movil:** PWA con `manifest.webmanifest` y service worker.

## Instalacion automatica

### Linux/macOS

```bash
bash scripts/install.sh
```

### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

Despues edita `.env` con tus credenciales y ejecuta:

```bash
npm run dev
```

## Variables de entorno

Copia `.env.example` a `.env` y completa:

```bash
PORT=8080
CLIENT_ORIGIN=http://localhost:5173
GEMINI_API_KEY=your_gemini_api_key
GEMINI_PRIMARY_MODELS=gemini-3.5-flash,gemini-3.1-flash-lite
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## Configuracion Google/Firebase

1. Crea un proyecto Firebase y habilita **Authentication > Google**.
2. Agrega los dominios permitidos para desarrollo y produccion.
3. Habilita Firestore y publica las reglas sugeridas en `firestore.rules`.
4. En Google Cloud, habilita **Google Drive API** para el mismo proyecto OAuth.
5. Asegura que la pantalla de consentimiento OAuth incluya el scope:
   `https://www.googleapis.com/auth/drive.file`.
6. Crea una API key de Gemini y guardala como `GEMINI_API_KEY` en el servidor.

## Flujo operativo

1. El operador inicia sesion con Google y autoriza `drive.file`.
2. Al subir **INE Frente**, el cliente llama a `/api/ocr`.
3. Gemini devuelve JSON con nombre, CURP, clave de elector y fecha de nacimiento.
4. Al guardar, la app crea una carpeta `{Nombre de Beneficiario}` en Drive.
5. Sube los 4 documentos requeridos:
   - INE Frente
   - INE Reverso
   - Fotografia del beneficiario
   - Acuse impreso firmado
6. Firestore guarda datos saneados, ID de carpeta, enlaces y IDs de archivos.
7. El panel lateral muestra carpetas creadas y expedientes completos.
8. **Descargar Excel** genera CSV con `UTF-8 BOM` y `sep=,`, respetando filtros activos.

## Instalar en Android o laptop

1. Sirve la app por HTTPS o `localhost`.
2. Abre la URL en Chrome, Edge o Safari.
3. Usa la opcion del navegador **Instalar app** / **Agregar a pantalla principal**.

## Scripts

- `npm run dev`: levanta cliente y servidor en modo desarrollo.
- `npm run build`: compila Vite y Express.
- `npm start`: sirve la build desde Express.
- `npm run typecheck`: valida TypeScript en ambos workspaces.
- `npm run lint`: ejecuta ESLint.