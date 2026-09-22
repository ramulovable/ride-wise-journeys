import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.shahintravels.app",
  appName: "Shahin Travels",
  webDir: "www",
  server: {
    url: "https://shahintravels.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0B1220",
  },
};

export default config;
