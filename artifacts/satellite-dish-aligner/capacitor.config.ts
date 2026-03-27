import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.satellite.dishaligner",
  appName: "ضبط طبق الأقمار",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    buildOptions: {
      releaseType: "APK",
    },
  },
};

export default config;
