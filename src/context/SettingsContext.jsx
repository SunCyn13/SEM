import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "app_settings";

export const REFRESH_OPTIONS = [3, 5, 10, 30, 60]; // วินาที

const DEFAULTS = {
  refreshSeconds: 3,
  soundAlert: true,
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULTS, ...saved };
  } catch {
    return DEFAULTS;
  }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <SettingsContext.Provider
      value={{ settings, updateSettings, refreshMs: settings.refreshSeconds * 1000 }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
