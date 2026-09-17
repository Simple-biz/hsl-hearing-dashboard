-- Per-checkbox completion timestamps on the Hearings dashboard.
-- Mirrors the workflow-checkbox `_at` columns on representative_docs: when a
-- checkbox is ticked the matching `_at` is stamped NOW(); unticking clears it.
-- The dashboard renders the date under the checkbox.
--
-- Nullable + no backfill: existing checked boxes have no historical timestamp,
-- so they show no date until next toggled. Stamps accrue going forward.

ALTER TABLE hearings
  ADD COLUMN IF NOT EXISTS task_assigned_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rep_docs_complete_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fee_agreement_complete_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS five_day_notice_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phi_sheet_complete_at     TIMESTAMPTZ;
