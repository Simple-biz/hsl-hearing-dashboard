"use client";

import { useState, useRef, useEffect } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// TEXT INLINE EDIT
// ============================================================
interface InlineTextProps {
  value: string | null;
  onSave: (value: string) => Promise<void>;
  editable?: boolean;
  placeholder?: string;
  className?: string;
}

export function InlineText({
  value,
  onSave,
  editable = true,
  placeholder = "—",
  className,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    if (draft === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setDraft(value ?? "");
      setEditing(false);
    }
  };

  if (!editable) {
    return (
      <span className={cn("text-sm", className)}>{value || placeholder}</span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          disabled={saving}
          className="w-full px-1.5 py-0.5 text-sm rounded border border-accent bg-white
                     focus:ring-1 focus:ring-accent/30 outline-none"
        />
        {saving && <Loader2 size={14} className="animate-spin text-accent" />}
      </div>
    );
  }

  return (
    <span
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      className={cn(
        "text-sm cell-editable px-1.5 py-0.5 -mx-1.5 rounded cursor-pointer",
        !value && "text-navy-400 italic",
        className,
      )}
    >
      {value || placeholder}
    </span>
  );
}

// ============================================================
// SELECT INLINE EDIT
// ============================================================
interface InlineSelectProps {
  value: string | number | null;
  onSave: (value: string) => Promise<void>;
  options: { value: string; label: string; color?: string }[];
  editable?: boolean;
  placeholder?: string;
  className?: string;
}

export function InlineSelect({
  value,
  onSave,
  options,
  editable = true,
  placeholder = "—",
  className,
}: InlineSelectProps) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (newValue: string) => {
    if (String(newValue) === String(value ?? "")) return;
    setSaving(true);
    try {
      await onSave(newValue);
    } finally {
      setSaving(false);
    }
  };

  const selected = options.find((o) => String(o.value) === String(value));

  if (!editable) {
    return (
      <span className={cn("text-sm", className)}>
        {selected?.label || placeholder}
      </span>
    );
  }

  return (
    <div className="relative">
      <select
        value={String(value ?? "")}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className={cn(
          "w-full px-1.5 py-0.5 text-sm rounded border border-transparent",
          "bg-transparent hover:border-navy-200 hover:bg-navy-50",
          "focus:border-accent focus:ring-1 focus:ring-accent/30 focus:bg-white",
          "outline-none transition-all cursor-pointer appearance-none",
          saving && "opacity-50",
          !value && "text-navy-400 italic",
          className,
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {saving && (
        <Loader2
          size={12}
          className="absolute right-1 top-1/2 -translate-y-1/2 animate-spin text-accent"
        />
      )}
    </div>
  );
}

// ============================================================
// CHECKBOX INLINE EDIT
// ============================================================
interface InlineCheckboxProps {
  value: boolean;
  onSave: (value: boolean) => Promise<void>;
  editable?: boolean;
  label?: string;
}

export function InlineCheckbox({
  value,
  onSave,
  editable = true,
  label,
}: InlineCheckboxProps) {
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (!editable) return;
    setSaving(true);
    try {
      await onSave(!value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <label
      className={cn(
        "flex items-center gap-1.5",
        editable && "cursor-pointer",
        saving && "opacity-50",
      )}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={handleChange}
        disabled={!editable || saving}
        className="hearing-check"
      />
      {label && <span className="text-sm text-navy-600">{label}</span>}
    </label>
  );
}

// ============================================================
// DATE INLINE EDIT
// ============================================================
interface InlineDateProps {
  value: string | null;
  onSave: (value: string) => Promise<void>;
  editable?: boolean;
  placeholder?: string;
}

export function InlineDate({
  value,
  onSave,
  editable = true,
  placeholder = "—",
}: InlineDateProps) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (newValue: string) => {
    if (newValue === (value ?? "")) return;
    setSaving(true);
    try {
      await onSave(newValue);
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return <span className="text-sm">{value || placeholder}</span>;
  }

  return (
    <div className="relative">
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className={cn(
          "px-1.5 py-0.5 text-sm rounded border border-transparent",
          "bg-transparent hover:border-navy-200 hover:bg-navy-50",
          "focus:border-accent focus:ring-1 focus:ring-accent/30 focus:bg-white",
          "outline-none transition-all cursor-pointer",
          saving && "opacity-50",
          !value && "text-navy-400",
        )}
      />
      {saving && (
        <Loader2
          size={12}
          className="absolute right-1 top-1/2 -translate-y-1/2 animate-spin text-accent"
        />
      )}
    </div>
  );
}
