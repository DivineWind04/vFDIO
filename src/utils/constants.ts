export const DOMAIN = typeof window !== "undefined" ? window.location.origin : (process.env.DOMAIN ?? "");
export const VATSIM_CLIENT_ID = process.env.VATSIM_CLIENT_ID ?? "1042";
export const VERSION = process.env.VERSION ?? "1.0.0";
export const VNAS_CONFIG_URL = process.env.VNAS_CONFIG_URL ?? "https://configuration.vnas.vatsim.net/";