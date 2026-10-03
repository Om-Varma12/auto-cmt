/**
 * key-store.ts
 *
 * AES-GCM-256 encryption for user API keys stored in chrome.storage.local.
 *
 * Architecture:
 *  - A random 256-bit master key is generated once per extension installation
 *    and stored as a JWK under '_enc_master_key' in chrome.storage.local.
 *  - Each API key is encrypted with that master key (random 12-byte IV per save)
 *    and stored as { iv: base64, cipher: base64 } under '_enc_key_<name>'.
 *  - When rememberApiKey is OFF the raw value goes to chrome.storage.session
 *    (in-memory, cleared when the browser closes) instead of local.
 *
 * Security guarantees:
 *  - The plaintext key is never logged, never returned to content scripts or pages.
 *  - crypto.subtle is available in all extension contexts (MV3).
 *  - chrome.storage.session is inaccessible to content scripts by default (MV3).
 */

const MASTER_KEY_STORE = '_enc_master_key';

// ── Master key ───────────────────────────────────────────────────────────────

async function getOrCreateMasterKey(): Promise<CryptoKey> {
  const data = await chrome.storage.local.get(MASTER_KEY_STORE);
  if (data[MASTER_KEY_STORE]) {
    return crypto.subtle.importKey(
      'jwk',
      data[MASTER_KEY_STORE] as JsonWebKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await chrome.storage.local.set({ [MASTER_KEY_STORE]: jwk });
  return key;
}

// ── Low-level encrypt / decrypt ──────────────────────────────────────────────

interface EncryptedBlob {
  iv: string;     // base64
  cipher: string; // base64
}

async function encryptString(plaintext: string): Promise<EncryptedBlob> {
  const key = await getOrCreateMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    cipher: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
  };
}

async function decryptBlob(blob: EncryptedBlob): Promise<string> {
  const key = await getOrCreateMasterKey();
  const iv = Uint8Array.from(atob(blob.iv), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(blob.cipher), c => c.charCodeAt(0));

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipher,
  );
  return new TextDecoder().decode(plainBuffer);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Saves an API key.
 *
 * @param name     Short identifier, e.g. 'ollama' or 'tavily'.
 * @param value    The plaintext key. Pass '' to clear the stored key.
 * @param remember When true the key is AES-GCM encrypted and persisted in
 *                 chrome.storage.local (survives browser restart).
 *                 When false the raw key is held only in chrome.storage.session
 *                 (in-memory; cleared when the browser closes) and any
 *                 previously persisted local copy is removed.
 */
export async function saveApiKey(
  name: string,
  value: string,
  remember: boolean,
): Promise<void> {
  const localKey = `_enc_key_${name}`;
  const sessionKey = `_key_${name}`;
  const flagKey = `_key_set_${name}`;

  if (!value) {
    // Clear both locations
    await Promise.allSettled([
      chrome.storage.local.remove([localKey, flagKey]),
      chrome.storage.session.remove(sessionKey),
    ]);
    return;
  }

  if (remember) {
    const blob = await encryptString(value);
    await chrome.storage.local.set({ [localKey]: blob, [flagKey]: true });
    // Remove any non-persistent copy
    await chrome.storage.session.remove(sessionKey).catch(() => {});
  } else {
    // Store raw key only in session (not persisted)
    await chrome.storage.session.set({ [sessionKey]: value });
    // Store presence flag in local (so Options page knows a key is set)
    await chrome.storage.local.set({ [flagKey]: true });
    // Remove any previously persisted encrypted copy
    await chrome.storage.local.remove(localKey).catch(() => {});
  }
}

/**
 * Loads a saved API key. Returns '' if not set.
 * Checks session storage first (non-remembered), then local encrypted storage.
 */
export async function loadApiKey(name: string): Promise<string> {
  const sessionKey = `_key_${name}`;
  const localKey = `_enc_key_${name}`;

  // Non-remembered (session) takes precedence
  const session = await chrome.storage.session.get(sessionKey).catch(() => ({}));
  const sessionVal = (session as Record<string, string>)[sessionKey];
  if (sessionVal) return sessionVal;

  // Remembered + encrypted
  const local = await chrome.storage.local.get(localKey);
  const blob = local[localKey] as EncryptedBlob | undefined;
  if (!blob?.iv) return '';

  try {
    return await decryptBlob(blob);
  } catch {
    // Corrupted blob — treat as absent
    return '';
  }
}

/**
 * Returns whether a key has ever been saved (without decrypting it).
 * Safe to call from the Options page for UI indicators.
 */
export async function isApiKeySet(name: string): Promise<boolean> {
  const data = await chrome.storage.local.get(`_key_set_${name}`);
  return Boolean(data[`_key_set_${name}`]);
}

/**
 * Removes all stored data for a key (both local and session).
 */
export async function clearApiKey(name: string): Promise<void> {
  await saveApiKey(name, '', true /* value='' clears both */);
}
