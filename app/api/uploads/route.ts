import { NextResponse } from "next/server";
import Busboy from "busboy";
import { Readable } from "node:stream";

import { uploadFile } from "@/actions/uploads";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 100 * 1024 * 1024;

type ParsedUpload = {
  fields: Record<string, string>;
  file?: { name: string; type: string; buffer: Buffer };
};

async function parseMultipart(req: Request): Promise<ParsedUpload> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data.");
  }
  if (!req.body) {
    throw new Error("Empty request body.");
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  return await new Promise<ParsedUpload>((resolve, reject) => {
    const bb = Busboy({
      headers,
      limits: { fileSize: MAX_BYTES, files: 1, fields: 20 },
    });

    const fields: Record<string, string> = {};
    let fileResult: ParsedUpload["file"];
    let fileTruncated = false;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        fileTruncated = true;
        stream.resume();
      });
      stream.on("end", () => {
        fileResult = {
          name: info.filename,
          type: info.mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks),
        };
      });
    });

    bb.on("error", (err: unknown) => {
      settle(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
    bb.on("close", () => {
      settle(() => {
        if (fileTruncated) {
          reject(
            new Error(`File is too large (max ${MAX_BYTES / (1024 * 1024)} MB).`),
          );
          return;
        }
        resolve({ fields, file: fileResult });
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(req.body as any);
    nodeStream.on("error", (err) => {
      settle(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
    nodeStream.pipe(bb);
  });
}

export async function POST(req: Request) {
  let parsed: ParsedUpload;
  try {
    parsed = await parseMultipart(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `Could not read upload: ${msg}` },
      { status: 400 },
    );
  }

  const formData = new FormData();
  for (const [k, v] of Object.entries(parsed.fields)) {
    formData.set(k, v);
  }
  if (parsed.file) {
    const blob = new Blob([new Uint8Array(parsed.file.buffer)], {
      type: parsed.file.type,
    });
    formData.set("file", blob, parsed.file.name);
  }

  const result = await uploadFile(formData);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
