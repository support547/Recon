"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  removeCompanyLogo,
  updateCompanyBranding,
  type BrandingSnapshot,
} from "@/actions/branding";
import {
  ALLOWED_MARKETPLACES,
  type Marketplace,
} from "@/lib/branding/marketplaces";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_LOGO_BYTES = 30 * 1024;
const ACCEPT = "image/png,image/jpeg,image/svg+xml";
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);
const FALLBACK_LOGO = "/edubooks-logo.svg";
const MARKETPLACE_UNSET = "__unset";

function initialMarketplace(snapshot: BrandingSnapshot): string {
  const first = snapshot.branding.marketplaces?.[0];
  return first ?? MARKETPLACE_UNSET;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed."));
    reader.readAsDataURL(file);
  });
}

export function CompanyBrandingClient({
  snapshot,
}: {
  snapshot: BrandingSnapshot;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = React.useState(
    snapshot.branding.displayName ?? snapshot.companyName,
  );
  const [logo, setLogo] = React.useState<string | null>(
    snapshot.branding.logo ?? null,
  );
  const [marketplace, setMarketplace] = React.useState<string>(
    initialMarketplace(snapshot),
  );
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const previewSrc = logo ?? FALLBACK_LOGO;

  const onPick = async (file: File | null) => {
    setFileError(null);
    if (!file) return;
    if (!ALLOWED_MIMES.has(file.type)) {
      setFileError("Logo must be PNG, JPEG, or SVG.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFileError(
        `Logo must be ≤ 30 KB (got ${Math.ceil(file.size / 1024)} KB).`,
      );
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setLogo(dataUrl);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Could not read file.");
    }
  };

  const onSave = () => {
    setFileError(null);
    const trimmed = displayName.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      toast.error("Display name must be 1–60 characters.");
      return;
    }
    const input: {
      displayName: string;
      logo?: string;
      marketplaces: Marketplace[];
    } = {
      displayName: trimmed,
      marketplaces:
        marketplace === MARKETPLACE_UNSET ? [] : [marketplace as Marketplace],
    };
    if (logo && logo !== snapshot.branding.logo) {
      input.logo = logo;
    }
    startTransition(async () => {
      const res = await updateCompanyBranding(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Branding saved.");
      router.refresh();
    });
  };

  const onRemoveLogo = () => {
    startTransition(async () => {
      const res = await removeCompanyLogo();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setLogo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Logo removed.");
      router.refresh();
    });
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">
          Company Branding
        </h2>
        <p className="text-xs text-muted-foreground">
          The display name and logo shown in the sidebar. The internal company
          name ({snapshot.companyName}) is not changed.
        </p>
      </div>

      <div className="space-y-6 rounded-lg border bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-zinc-50">
            {/* branding.logo may later hold an https:// object-storage URL
                instead of a data URL; <img> already supports both. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt="Logo preview"
              className="size-12 object-contain"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="logo-file">Logo</Label>
            <Input
              ref={fileInputRef}
              id="logo-file"
              type="file"
              accept={ACCEPT}
              onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              PNG, JPEG, or SVG · max 30 KB.
            </p>
            {fileError ? (
              <p className="text-xs text-destructive">{fileError}</p>
            ) : null}
            {snapshot.branding.logo ? (
              <button
                type="button"
                onClick={onRemoveLogo}
                disabled={pending}
                className="self-start text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
              >
                Remove saved logo
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            1–60 characters. Shown in the sidebar header.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="marketplace">Marketplace</Label>
          <Select
            value={marketplace}
            onValueChange={setMarketplace}
            disabled={pending}
          >
            <SelectTrigger id="marketplace" className="w-full sm:w-64">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MARKETPLACE_UNSET}>Not set</SelectItem>
              {ALLOWED_MARKETPLACES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            One marketplace per company for now. Stored as an array so multi-marketplace can be added later without a migration.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </main>
  );
}
