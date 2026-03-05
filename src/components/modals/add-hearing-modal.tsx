"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Loader2 } from "lucide-react";
import { addHearing } from "@/app/(dashboard)/actions";

const CLAIM_TYPES = [
  "Title II",
  "Title XVI",
  "Overpayment",
  "Concurrent Title II",
  "Concurrent",
  "DIB",
  "SSI",
];
const TIMEZONES = [
  { value: "ET", label: "Eastern" },
  { value: "CT", label: "Central" },
  { value: "MT", label: "Mountain" },
  { value: "PT", label: "Pacific" },
  { value: "HA", label: "Hawaii" },
  { value: "MSTA", label: "AZ" },
];
const DOWNLOAD_TYPES = [
  "Exhibited",
  "Exhibited & All",
  "No Exhibited",
  "No Exhibited & All",
  "No SSN Match",
  "Exhibited & No SSN Match",
  "No SSN Match & All",
  "OCR Pre-processing",
  "Failed & All",
  "All",
  "In ERE Queue...",
  "No Exhibited & Completed",
  "No Exhibited & No SSN Match",
];
const MOA_TYPES = [
  "Get Phone Permission",
  "Case is Ready",
  "In Person Florida",
  "Phone",
  "OVH",
];

interface AddHearingModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddHearingModal({ onClose, onSuccess }: AddHearingModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    claimant: "",
    ssn_last_4: "",
    claim_type: "",
    hearing_date: "",
    hearing_time: "",
    time_zone: "ET",
    alj: "",
    city: "",
    state: "",
    claimant_location: "",
    representative_location: "",
    medical_expert: "",
    vocational_expert: "",
    status_date: "",
    entered_hearing_level_date: "",
    download_type: "",
    manner_of_appearance: "",
  });

  const set = (key: string, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async () => {
    if (!form.claimant || !form.hearing_date || !form.hearing_time) {
      setError("Claimant, Date, and Time are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addHearing(form);
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add hearing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/50 px-6 py-5">
          <h2 className="text-lg font-semibold">➕ Add New Hearing</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div>
            <p className="mb-3 text-sm font-semibold border-b pb-2">
              Basic Info
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="mb-1.5 block text-sm font-medium">
                  Claimant *
                </label>
                <Input
                  value={form.claimant}
                  onChange={(e) => set("claimant", e.target.value)}
                  className="h-10 text-sm"
                  placeholder="Last, First M."
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  SSN (Last 4)
                </label>
                <Input
                  value={form.ssn_last_4}
                  onChange={(e) => set("ssn_last_4", e.target.value)}
                  maxLength={4}
                  className="h-10 text-sm"
                  placeholder="1234"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium">
                Claim Type
              </label>
              <Select
                value={form.claim_type || "__none__"}
                onValueChange={(v) =>
                  set("claim_type", v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select</SelectItem>
                  {CLAIM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Hearing Details */}
          <div>
            <p className="mb-3 text-sm font-semibold border-b pb-2">
              Hearing Details
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Date *
                </label>
                <Input
                  type="date"
                  value={form.hearing_date}
                  onChange={(e) => set("hearing_date", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Time *
                </label>
                <Input
                  type="time"
                  value={form.hearing_time}
                  onChange={(e) => set("hearing_time", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Time Zone
                </label>
                <Select
                  value={form.time_zone}
                  onValueChange={(v) => set("time_zone", v)}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">ALJ</label>
                <Input
                  value={form.alj}
                  onChange={(e) => set("alj", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Manner of Appearance
                </label>
                <Select
                  value={form.manner_of_appearance || "__none__"}
                  onValueChange={(v) =>
                    set("manner_of_appearance", v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select</SelectItem>
                    {MOA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="mb-3 text-sm font-semibold border-b pb-2">Location</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">City</label>
                <Input
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  State
                </label>
                <Input
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  maxLength={2}
                  className="h-10 text-sm"
                  placeholder="FL"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Claimant Location
                </label>
                <Input
                  value={form.claimant_location}
                  onChange={(e) => set("claimant_location", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Rep Location
                </label>
                <Input
                  value={form.representative_location}
                  onChange={(e) =>
                    set("representative_location", e.target.value)
                  }
                  className="h-10 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Additional */}
          <div>
            <p className="mb-3 text-sm font-semibold border-b pb-2">
              Additional
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Medical Expert
                </label>
                <Input
                  value={form.medical_expert}
                  onChange={(e) => set("medical_expert", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Vocational Expert
                </label>
                <Input
                  value={form.vocational_expert}
                  onChange={(e) => set("vocational_expert", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Status Date
                </label>
                <Input
                  type="date"
                  value={form.status_date}
                  onChange={(e) => set("status_date", e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Entered Hearing Level
                </label>
                <Input
                  type="date"
                  value={form.entered_hearing_level_date}
                  onChange={(e) =>
                    set("entered_hearing_level_date", e.target.value)
                  }
                  className="h-10 text-sm"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium">
                Download Type
              </label>
              <Select
                value={form.download_type || "__none__"}
                onValueChange={(v) =>
                  set("download_type", v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select</SelectItem>
                  {DOWNLOAD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t bg-muted/50 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-4 text-sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-9 px-4 gap-2 text-sm bg-green-600 hover:bg-green-700"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Adding..." : "➕ Add Hearing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
