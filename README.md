# OmniSend Masivo

PWA React/TypeScript para envios masivos de SMS desde archivos Excel (`.xlsx`) y CSV. Incluye deteccion
automatica de telefono y nombre, plantillas con variables `{{Columna}}`, gateways dinamicos, modo SMS nativo
celular y bitacora exportable a Excel.

## Funcionalidades

- Importacion local de `.xlsx` y `.csv` en el navegador.
- Autodescubrimiento de columnas de telefono y nombre por patrones de encabezado y muestras de datos.
- Interpolacion robusta de variables `{{Columna}}`; los valores nulos o vacios no rompen el mensaje.
- Gateways: Simulador, Twilio, Vonage, Webhook HTTP personalizado y SMS celular nativo.
- Flujo mobile/PWA para abrir enlaces `sms:` en Android (`?body=`) e iOS (`;body=`).
- Historial de auditoria con busqueda, filtros por estado y exportacion `.xlsx`.
- Diseno responsivo premium para escritorio, web y Android.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

> Nota: Twilio, Vonage y algunos webhooks pueden requerir configuracion CORS o un backend proxy en produccion.
> El modo nativo delega el envio final a la app SMS del dispositivo, por lo que el usuario confirma cada mensaje.