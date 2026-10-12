import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${ip}|${process.env.IP_HASH_SALT || "flameph"}`).digest("hex").slice(0, 32);
}
