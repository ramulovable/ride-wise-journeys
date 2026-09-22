import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.shahintravels.driver",
  appName: "Shahin Travels Driver",
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
