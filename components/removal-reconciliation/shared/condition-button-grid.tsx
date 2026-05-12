"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type ConditionPreset = {
  value: string;
  label: string;
  icon: string;
  transferTo: string;
  whStatus: string;
  triggersCase: boolean;
  caseReason?: string;
};

export const CONDITION_PRESETS: ConditionPreset[] = [
  { value: "NEW",             label: "NEW",             icon: "⭐",  transferTo: "FBA Reshipment", whStatus: "Received - Ready",         triggersCase: false },
  { value: "LIKE NEW",        label: "LIKE NEW",        icon: "✨",  transferTo: "FBA Reshipment", whStatus: "Received - Ready",         triggersCase: false },
  { value: "USED GOOD",       label: "USED GOOD",       icon: "📖", transferTo: "FBA Reshipment", whStatus: "Received - Ready",         triggersCase: false },
  { value: "USED",            label: "USED",            icon: "📘", transferTo: "FBA Reshipment", whStatus: "Received - Ready",         triggersCase: false },
  { value: "INCORRECT ITEM",  label: "INCORRECT ITEM",  icon: "❌", transferTo: "Hold / Pending", whStatus: "Incorrect Item",           triggersCase: true,  caseReason: "Removal_Incorrect_Item" },
  { value: "DAMAGED",         label: "DAMAGED",         icon: "🔧", transferTo: "Dispose",         whStatus: "Damaged - Case Needed",    triggersCase: true,  caseReason: "Removal_Transit_Damage" },
  { value: "WATER DAMAGED",   label: "WATER DAMAGED",   icon: "💧", transferTo: "Dispose",         whStatus: "Damaged - Case Needed",    triggersCase: true,  caseReason: "Removal_Water_Damage" },
  { value: "DISPOSE",         label: "DISPOSE",         icon: "🗑️", transferTo: "Dispose",         whStatus: "Disposed",                 triggersCase: false },
];

export function ConditionButtonGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (preset: ConditionPreset) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {CONDITION_PRESETS.map((p) => {
        const active = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "flex flex-col items-center justify-center rounded-md border px-2 py-2 text-[10px] font-semibold transition",
              active
                ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <span className="text-base">{p.icon}</span>
            <span className="mt-1">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const CASE_TYPE_PRESETS = [
  { value: "Removal_Not_Received", label: "📦 Not Received" },
  { value: "Removal_Short_Received", label: "⚠️ Short" },
  { value: "Removal_Transit_Damage", label: "🔧 Transit Damage" },
  { value: "Removal_Water_Damage", label: "💧 Water Damage" },
  { value: "Removal_Incorrect_Item", label: "❌ Incorrect Item" },
  { value: "Removal_Poor_Condition", label: "📕 Poor Condition" },
  { value: "Removal_Carrier_Damage", label: "🚛 Carrier Damage" },
];

export function CaseTypeButtonGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CASE_TYPE_PRESETS.map((p) => {
        const active = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={cn(
              "rounded-md border px-2 py-1 text-[10px] font-semibold transition",
              active
                ? "border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-300"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export const POST_ACTION_PRESETS = [
  { value: "Resell Ready", label: "📚 Resell Ready", transferTo: "FBA Reshipment" },
  { value: "Reshipped to FBA", label: "🚚 Reship to FBA", transferTo: "FBA Reshipment" },
  { value: "Disposed", label: "🗑️ Disposed", transferTo: "Dispose" },
  { value: "Donated", label: "🤝 Donated", transferTo: "Donate" },
  { value: "Restricted by FBA", label: "🚫 Restricted by FBA", transferTo: "Hold / Pending" },
  { value: "Local Sale", label: "💵 Local Sale", transferTo: "Local Sale" },
  { value: "Reimbursed", label: "💰 Reimbursed by Amazon", transferTo: "Dispose" },
  { value: "Case Pending", label: "⚖️ Case Pending", transferTo: "Hold / Pending" },
];
