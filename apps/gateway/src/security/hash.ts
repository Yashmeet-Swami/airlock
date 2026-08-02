import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateRawSecret(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
