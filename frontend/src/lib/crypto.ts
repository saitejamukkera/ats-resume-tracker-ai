// lib/crypto.ts
// Web Crypto helpers — AES-256-GCM encryption for API keys in localStorage.
// Keys encrypted at rest; decrypted on mount with PBKDF2 key derivation.

const ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const KEY_DERIVATION = {
  name: "PBKDF2",
  hash: "SHA-256",
  iterations: 600000,
} as const;
const BASE_MATERIAL = "ats-job-tracker-key-vault-v1";

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(BASE_MATERIAL),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { ...KEY_DERIVATION, salt: salt.buffer as BufferSource },
    baseKey,
    ALGORITHM,
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptApiKeys(
  keys: Record<string, string>,
): Promise<{ encrypted: string; ivWithSalt: string }> {
  const salt = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)));
  const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(12)));
  const key = await deriveKey(salt);

  const encoded = new TextEncoder().encode(JSON.stringify(keys));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoded,
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    ivWithSalt:
      btoa(String.fromCharCode(...iv)) +
      "." +
      btoa(String.fromCharCode(...salt)),
  };
}

export async function decryptApiKeys(
  encrypted: string,
  ivWithSalt: string,
): Promise<Record<string, string> | null> {
  try {
    const [ivB64, saltB64] = ivWithSalt.split(".");
    if (!ivB64 || !saltB64) return null;

    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const key = await deriveKey(salt);

    const ciphertext = Uint8Array.from(atob(encrypted), (c) =>
      c.charCodeAt(0),
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}
