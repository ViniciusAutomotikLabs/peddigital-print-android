function stubPlugin(name) {
  if (name === "LocalServer") {
    return {
      async start() {
        return { running: false };
      },
      async stop() {
        return { running: false };
      },
      async status() {
        return { running: false };
      },
    };
  }
  return {
    async send() {
      throw new Error("Abra pelo APK Android para imprimir (TCP nativo).");
    },
  };
}

export const Capacitor = {
  isNativePlatform() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  },
  getPlatform() {
    if (window.Capacitor?.getPlatform) return window.Capacitor.getPlatform();
    return "web";
  },
};

export function registerPlugin(name) {
  if (window.Capacitor?.registerPlugin) {
    return window.Capacitor.registerPlugin(name);
  }
  if (window.Capacitor?.Plugins?.[name]) {
    return window.Capacitor.Plugins[name];
  }
  return stubPlugin(name);
}
