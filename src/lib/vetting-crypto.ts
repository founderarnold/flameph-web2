import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

// Vetting documents are encrypted by the server (AES-256-GCM) before they are stored, on top of the storage
// provider's own disk encryption. The key is derived from an existing server secret, so there is no new secret to set
// up; VETTING_DOCS_KEY can be added later to use a dedicated key. key_id records which key encrypted each file, so a
// file is never opened with the wrong key. The key never reaches the browser.

const IV = 12, TAG = 16;

export function vettingKey(env: Record<string, string | undefined> = process.env): { key: Buffer; id: string } | null {
  const base = env.VETTING_DOCS_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) return null;
  const key = createHmac("sha256", base).update("flameph-vetting-docs-v1").digest();
  return { key, id: createHash("sha256").update(key).digest("hex").slice(0, 12) };
}

/** iv (12 bytes) + tag (16 bytes) + ciphertext. */
export function encryptDoc(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

/** Throws if the file was changed or the key is wrong. */
export function decryptDoc(blob: Buffer, key: Buffer): Buffer {
  if (blob.length < IV + TAG) throw new Error("bad_file");
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, IV));
  d.setAuthTag(blob.subarray(IV, IV + TAG));
  return Buffer.concat([d.update(blob.subarray(IV + TAG)), d.final()]);
}

/** The first bytes of each allowed type, so a renamed file can't pretend to be a PDF or picture. */
export function sniffMime(buf: Buffer): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}
