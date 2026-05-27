"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { requireAuth } from "@/actions/auth";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const PUBLIC_DIR = path.join(process.cwd(), "public", "case-attachments");

export type UploadCaseAttachmentResult =
  | { ok: true; url: string; filename: string }
  | { ok: false; error: string };

export async function uploadCaseAttachment(
  formData: FormData,
): Promise<UploadCaseAttachmentResult> {
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
    return { ok: false, error: "PDF too large (max 10 MB)." };
  }

  const lower = file.name.toLowerCase();
  const isPdf =
    file.type === "application/pdf" || lower.endsWith(".pdf");
  if (!isPdf) {
    return { ok: false, error: "Only PDF files are allowed." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await mkdir(PUBLIC_DIR, { recursive: true });

  const safeBase = lower.replace(/[^a-z0-9._-]+/g, "_").slice(-80);
  const fname = `${Date.now()}_${randomUUID()}_${safeBase}`;
  const full = path.join(PUBLIC_DIR, fname);
  await writeFile(full, buf);

  return {
    ok: true,
    url: `/case-attachments/${fname}`,
    filename: file.name,
  };
}
