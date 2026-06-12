import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "mx.gob.beneficiarios.drive",
  appName: "Beneficiarios Drive",
  webDir: "client/dist",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
};

export default config;
