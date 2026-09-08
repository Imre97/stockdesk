import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json";
import huCommon from "./locales/hu/common.json";

export const defaultNamespace = "common";

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon },
    hu: { common: huCommon },
  },
  lng: "en",
  fallbackLng: "en",
  ns: [defaultNamespace],
  defaultNS: defaultNamespace,
  interpolation: { escapeValue: false },
});
