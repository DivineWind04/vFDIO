export const DOMAIN = process.env.DOMAIN;
export const VATSIM_CLIENT_ID = process.env.VATSIM_CLIENT_ID;
export const VERSION = process.env.VERSION;
export const VNAS_CONFIG_URL = process.env.VNAS_CONFIG_URL;

const requiredEnvVars = { DOMAIN, VATSIM_CLIENT_ID, VERSION, VNAS_CONFIG_URL } as const;
const missing = Object.entries(requiredEnvVars)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}