import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createConfig, redactConfig, type StoreAgentConfig } from "./config.js";

export interface StoredConfig extends StoreAgentConfig {
  clientId?: string;
  grantedScopes?: string[];
}

export function defaultConfigPath(home = homedir()): string {
  return join(home, ".shopify-store-agent", "config.json");
}

export async function loadStoredConfig(path = defaultConfigPath()): Promise<StoredConfig | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as StoredConfig;
    return {
      ...createConfig(parsed),
      clientId: parsed.clientId,
      grantedScopes: parsed.grantedScopes
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function saveStoredConfig(config: StoredConfig, path = defaultConfigPath()): Promise<StoredConfig> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return redactConfig(config) as StoredConfig;
}
