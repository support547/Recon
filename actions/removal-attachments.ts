"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { requireAuth } from "@/actions/auth";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const PUBLIC_DIR = path.join(process.cwd(), "public", "removal-attachments");

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const ALLOWED_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export type UploadRemovalAttachmentResult =
  | { ok: true; url: string; filename: string }
  | { ok: false; error: string };

export async function uploadRemovalAttachment(
  formData: FormData,
): Promise<UploadRemovalAttachmentResult> {
  try {
    await requireAuth();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unauthorized.",
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file uploaded." };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File too large (max 15 MB)." };
  }

  const lower = file.name.toLowerCase();
  const ext = path.extname(lower);
  if (!ALLOWED_MIME.has(file.type) && !ALLOWED_EXT.has(ext)) {
    return { ok: false, error: "Only PDF and image files are allowed." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await mkdir(PUBLIC_DIR, { recursive: true });

  const safeBase = lower.replace(/[^a-z0-9._-]+/g, "_").slice(-80);
  const fname = `${Date.now()}_${randomUUID()}_${safeBase}`;
  const full = path.join(PUBLIC_DIR, fname);
  await writeFile(full, buf);

  return {
    ok: true,
    url: `/removal-attachments/${fname}`,
    filename: file.name,
  };
}
