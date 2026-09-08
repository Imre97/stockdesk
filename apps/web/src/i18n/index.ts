import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enAuth from "./locales/en/auth.json";
import enCommon from "./locales/en/common.json";
import huAuth from "./locales/hu/auth.json";
import huCommon from "./locales/hu/common.json";

export const defaultNamespace = "common";

export const namespaces = [defaultNamespace, "auth"];

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, auth: enAuth },
    hu: { common: huCommon, auth: huAuth },
  },
  lng: "en",
  fallbackLng: "en",
  ns: namespaces,
  defaultNS: defaultNamespace,
  interpolation: { escapeValue: false },
});
