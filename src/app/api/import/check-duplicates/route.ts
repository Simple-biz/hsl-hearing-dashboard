import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSSN(raw: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "").slice(-4);
  return digits.length > 0 ? digits.padStart(4, "0") : null;
}

// Tiny trigram-based similarity score, used for "did you mean ...?" rep
// suggestions when a sheet name doesn't match any canonical name or alias.
// 0 = no overlap, 1 = identical (after lowercasing). Pure JS; no extension
// needed. With ~65 reps this runs in well under a millisecond per CSV name.
function trigramSet(s: string): Set<string> {
  const padded = `  ${s.toLowerCase().trim()}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}
function trigramSimilarity(a: string, b: string): number {
  const ta = trigramSet(a);
  const tb = trigramSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

// Normalize a time string for comparison: "8:30 AM" → "08:30",
// "08:30:00" → "08:30", "8:30" → "08:30". Returns "" for empty/invalid input.
// Lifted to module scope so the rescheduled-on-time-change check at the top
// of the matching loop and the field-diff logic (deeper in) share the same
// rules — otherwise a row could be classified differently than its diff.
function normalizeTime(t: string): string {
  if (!t) return "";
  const s = t.trim();
  const ap = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ap) {
    let h = parseInt(ap[1]);
    if (ap[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ap[3].toUpperCase() === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${ap[2]}`;
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}`;
  return s;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const y = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${y}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const n = Number(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    return new Date((n - 25569) * 86400000).toISOString().split("T")[0];
  }
  return null;
}

// ─── POST /api/import/check-duplicates ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );

  const body = await req.json();
  const {
    mapping,
    rows,
    crossSheetLookups = {},
    rowOffset = 0,
    compare_mode = false,
    fuzzy_name_match = false,
    comments = {},
  } = body;

  // Compare mode: return minimal claimant+date+ssn for all hearings
  if (compare_mode) {
    const { rows: allH } = await db.query(
      "SELECT claimant, hearing_date::text, ssn_last_4 FROM hearings",
    );
    return NextResponse.json({ success: true, all_hearings: allH });
  }

  if (!mapping || !rows || rows.length === 0) {
    return NextResponse.json({ success: false, message: "No data to check" });
  }

  // ── Pre-fetch all existing hearings into lookup maps (single query) ──
  const { rows: existing } = await db.query(
    `SELECT id, claimant, ssn_last_4, hearing_date::text, hearing_time, time_zone,
       claim_type, converted_time_est,
       city, state, claimant_location, representative_location, alj,
       medical_expert, vocational_expert, status_date::text,
       entered_hearing_level_date::text, download_type, manner_of_appearance,
       hearing_decision_status, medical_record_status, medical_record_link,
       rfc_status, claimant_link, assigned_rep_id, mr_team_id,
       brief_assigned_to, task_assigned, rep_docs_complete, fee_agreement_complete,
       phi_sheet_complete, five_day_notice, post_hrg_deadline::text, post_hrg_notes,
       rep_docs_assigned_to, post_hrg_review, assignment_status
FROM hearings`,
  );

  // Archived hearings live in a separate `archived_hearings` table. Pull
  // their key columns too — otherwise a CSV row matching an archived hearing
  // falls through every active-table tier and gets mislabeled "new" (then
  // re-imported). Only the matching-key columns are needed; archived matches
  // skip the field-diff below.
  const { rows: archivedRows } = await db.query(
    `SELECT hearing_id AS id, claimant, ssn_last_4, hearing_date::text,
            hearing_time::text AS hearing_time,
            converted_time_est::text AS converted_time_est
       FROM archived_hearings`,
  );
  const archivedIds = new Set<number>(
    (archivedRows as { id: number }[]).map((r) => r.id),
  );
  // Combined set used to build the match lookups (tier maps, byNameAndSsn,
  // bySsn). Active rows first so they win first-write-wins keys over archived.
  const allExisting = [...existing, ...archivedRows];

  // Full record lookup by id (for diff comparison on duplicates)
  const byId = new Map<number, Record<string, unknown>>();
  for (const row of allExisting) byId.set(row.id as number, row);

  // ── Lookups for FK fields (representative, mr_team_id) ──
  // We resolve the sheet's display name → DB id so we can compare against the
  // hearing's FK column. Only loaded when the corresponding field is mapped.
  const repByName = new Map<string, number>(); // lower(name) → id
  const repById = new Map<number, string>(); // id → name (for diff display)
  // Canonical name list for fuzzy fallback when neither the main name nor
  // any alias matches. Used to surface "did you mean ...?" suggestions.
  const repNames: { id: number; name: string }[] = [];
  const teamByName = new Map<string, number>(); // lower(team_name) → id
  const teamById = new Map<number, string>(); // id → team_name
  if (mapping?.representative !== undefined) {
    const { rows: repRows } = await db.query(
      "SELECT id, name, name_aliases FROM representatives",
    );
    for (const r of repRows) {
      const canonical = String(r.name || "");
      const key = canonical.toLowerCase().trim();
      if (key) repByName.set(key, r.id);
      repById.set(r.id, canonical);
      if (canonical) repNames.push({ id: r.id as number, name: canonical });

      // Index aliases (TEXT[]) the same way. First-write wins — if two reps
      // claim the same alias, the canonical-name row registered above
      // already won the lower(name) key; aliases only fill gaps.
      const aliases: unknown[] = Array.isArray(r.name_aliases)
        ? r.name_aliases
        : [];
      for (const a of aliases) {
        const aliasKey = String(a || "")
          .toLowerCase()
          .trim();
        if (aliasKey && !repByName.has(aliasKey)) {
          repByName.set(aliasKey, r.id);
        }
      }
    }
  }
  if (mapping?.mr_team_id !== undefined) {
    const { rows: teamRows } = await db.query(
      "SELECT id, team_name FROM mr_teams",
    );
    for (const t of teamRows) {
      const key = String(t.team_name || "")
        .toLowerCase()
        .trim();
      if (key) teamByName.set(key, t.id);
      teamById.set(t.id, String(t.team_name || ""));
    }
  }

  // Suffix-stripping helper — declared up here so the tier-map builder can
  // index DB names both with and without their "(Rescheduled)" / "(SSN)"
  // tags. The DB stores e.g. "Crystal Coker (Rescheduled)" but a Chronicle
  // CSV carries the plain "Crystal Coker"; exact-match tiers would never
  // bridge that gap, so we index a base-name key alongside the exact one.
  const RESCHED_RE = /\s*\(Rescheduled(?:\s+\d+)?\)\s*$/i;
  const SSN_SUFFIX_RE = /\s*\(\d{4}\)\s*$/;
  const baseNameOf = (s: string): string =>
    String(s || "")
      .replace(RESCHED_RE, "")
      .replace(SSN_SUFFIX_RE, "")
      .trim();

  // Build 3 lookup maps for three-tier matching
  const tier1 = new Map<string, number>(); // claimant|ssn|date → id
  const tier2 = new Map<string, number>(); // claimant|ssn → id
  const tier3 = new Map<string, number>(); // claimant|date → id
  const tier4 = new Map<string, number>(); // ssn|date → id (handles name typos)

  for (const row of allExisting) {
    const c = (row.claimant || "").trim();
    const s = (row.ssn_last_4 || "").padStart(4, "0");
    const d = row.hearing_date || "";
    const id = row.id as number;

    if (c && s && d) tier1.set(`${c}|${s}|${d}`, id);
    if (c && s && !tier2.has(`${c}|${s}`)) tier2.set(`${c}|${s}`, id);
    if (c && d && !tier3.has(`${c}|${d}`)) tier3.set(`${c}|${d}`, id);
    // Tier 4: SSN + date only (handles name typos) — only when fuzzy matching enabled
    if (fuzzy_name_match && s && d && !tier4.has(`${s}|${d}`))
      tier4.set(`${s}|${d}`, id);

    // Also index by the base name (suffix stripped) so a plain CSV name
    // matches a DB record carrying "(Rescheduled)" / "(SSN)" directly —
    // without depending on tier-4 fuzzy + trigram. Exact-name keys above
    // still take precedence (don't overwrite them).
    const cb = baseNameOf(c);
    if (cb && cb !== c) {
      if (cb && s && d && !tier1.has(`${cb}|${s}|${d}`))
        tier1.set(`${cb}|${s}|${d}`, id);
      if (cb && s && !tier2.has(`${cb}|${s}`)) tier2.set(`${cb}|${s}`, id);
      if (cb && d && !tier3.has(`${cb}|${d}`)) tier3.set(`${cb}|${d}`, id);
    }
  }

  const byNameAndSsn = new Map<
    string,
    { id: number; claimant: string; hearing_date: string; hearing_time: string }
  >();
  // SSN-only lookup for rescheduled detection (handles name typos)
  const bySsn = new Map<
    string,
    { id: number; claimant: string; hearing_date: string; hearing_time: string }
  >();
  for (const row of allExisting) {
    const c = (row.claimant || "").trim();
    const s = (row.ssn_last_4 || "").padStart(4, "0");
    if (c && s) {
      const id = row.id as number;
      const entry = {
        id,
        claimant: c,
        hearing_date: row.hearing_date || "",
        hearing_time: row.hearing_time || row.converted_time_est || "",
      };

      // Index by exact name
      const exactKey = `${c.toLowerCase()}|${s}`;
      const prev = byNameAndSsn.get(exactKey);
      if (!prev || id > prev.id) byNameAndSsn.set(exactKey, entry);

      // Also index by base name (strip Rescheduled and SSN suffix tags)
      // So "John Doe (Rescheduled 2)" → "john doe" and "Jane Doe (1234)" → "jane doe"
      const baseName = c
        .replace(RESCHED_RE, "")
        .replace(SSN_SUFFIX_RE, "")
        .trim();
      if (baseName.toLowerCase() !== c.toLowerCase()) {
        const baseKey = `${baseName.toLowerCase()}|${s}`;
        const basePrev = byNameAndSsn.get(baseKey);
        if (!basePrev || id > basePrev.id) byNameAndSsn.set(baseKey, entry);
      }
      // SSN-only index (for name typo matching) — only when fuzzy matching enabled
      if (fuzzy_name_match) {
        const ssnPrev = bySsn.get(s);
        if (!ssnPrev || id > ssnPrev.id) bySsn.set(s, entry);
      }
    }
  }

  // ── Process rows using in-memory lookups (zero DB queries per row) ──
  const newRecords: Record<string, unknown>[] = [];
  const duplicateRecords: Record<string, unknown>[] = [];
  const skippedRecords: Record<string, unknown>[] = [];
  const rescheduledRecords: Record<string, unknown>[] = [];
  // Cache "did you mean ...?" candidates for each unmatched CSV rep name.
  // Keyed by lowercased CSV value so we only compute suggestions once per
  // distinct mystery name even if it appears on hundreds of rows.
  type RepSuggestion = { id: number; name: string; score: number };
  const repNameSuggestions = new Map<string, RepSuggestion[]>();
  const computeRepSuggestions = (csvName: string): RepSuggestion[] => {
    const cached = repNameSuggestions.get(csvName);
    if (cached) return cached;
    if (repNames.length === 0) {
      repNameSuggestions.set(csvName, []);
      return [];
    }
    const scored = repNames
      .map((r) => ({
        id: r.id,
        name: r.name,
        score: trigramSimilarity(csvName, r.name),
      }))
      .filter((c) => c.score >= 0.5) // weak matches drop out
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    repNameSuggestions.set(csvName, scored);
    return scored;
  };
  const debugResched: Record<string, unknown>[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] as string[];

    const claimant =
      mapping.claimant !== undefined
        ? String(row[mapping.claimant] || "").trim()
        : "";
    const hearingDate =
      mapping.hearing_date !== undefined
        ? parseDate(String(row[mapping.hearing_date] || ""))
        : null;
    let ssn =
      mapping.ssn_last_4 !== undefined
        ? String(row[mapping.ssn_last_4] || "").trim()
        : "";
    const claimType =
      mapping.claim_type !== undefined
        ? String(row[mapping.claim_type] || "").trim()
        : "";
    let claimantLocation =
      mapping.claimant_location !== undefined
        ? String(row[mapping.claimant_location] || "").trim()
        : "";
    let repLocation =
      mapping.representative_location !== undefined
        ? String(row[mapping.representative_location] || "").trim()
        : "";
    let downloadType =
      mapping.download_type !== undefined
        ? String(row[mapping.download_type] || "").trim()
        : "";
    let statusDate =
      mapping.status_date !== undefined
        ? String(row[mapping.status_date] || "").trim()
        : "";

    const lookupData = crossSheetLookups[String(rowIndex)];
    if (lookupData) {
      if (!ssn && lookupData.ssn) ssn = lookupData.ssn;
      if (lookupData.claimantLocation)
        claimantLocation = lookupData.claimantLocation;
      if (lookupData.repLocation) repLocation = lookupData.repLocation;
      if (lookupData.downloadType) downloadType = lookupData.downloadType;
      if (lookupData.statusDate) statusDate = lookupData.statusDate;
    }

    if (
      !claimant ||
      claimant === "0" ||
      claimant === "1" ||
      claimant.toLowerCase() === "false" ||
      claimant.toLowerCase() === "true"
    ) {
      skippedRecords.push({
        row: rowOffset + rowIndex + 2,
        rowIndex: rowOffset + rowIndex,
        claimant: claimant || "(empty)",
        hearing_date: hearingDate,
        ssn: null,
        claim_type: claimType,
        claimantLocation,
        repLocation,
        downloadType,
        statusDate,
        reason: "Empty or invalid claimant",
      });
      continue;
    }

    if (!hearingDate) {
      skippedRecords.push({
        row: rowOffset + rowIndex + 2,
        rowIndex: rowOffset + rowIndex,
        claimant,
        hearing_date: null,
        ssn: null,
        claim_type: claimType,
        claimantLocation,
        repLocation,
        downloadType,
        statusDate,
        reason: "Missing hearing date",
      });
      continue;
    }

    const ssnFormatted = formatSSN(ssn);

    // ── Rescheduled detection ──
    if (RESCHED_RE.test(claimant)) {
      const baseName = claimant.replace(RESCHED_RE, "").trim();
      const debugEntry: Record<string, unknown> = {
        claimant,
        baseName,
        ssn_raw: ssn,
        ssnFormatted,
        hearingDate,
        hasLookup: !!crossSheetLookups[String(rowIndex)],
        lookupSsn: crossSheetLookups[String(rowIndex)]?.ssn || null,
      };

      if (!ssnFormatted) {
        debugEntry.reason = "No SSN formatted — skipping rescheduled check";
        debugResched.push(debugEntry);
        // Fall through to normal check
      } else {
        // Check if this EXACT rescheduled name + SSN + date already exists (true duplicate)
        // If name+SSN match but date is different → it's a NEW reschedule, not already imported
        const exactTier1Key = `${claimant}|${ssnFormatted}|${hearingDate}`;
        const alreadyImported = tier1.has(exactTier1Key);

        if (!alreadyImported) {
          // Find the record to update: first try exact name+SSN, then base name+SSN,
          // then SSN-only (handles name typos like "RaZiyah" vs "Ra'Ziyah").
          // SSN-last-4 has only 4 digits of entropy so collisions across
          // unrelated people are common — require some name overlap before
          // accepting the SSN-only fallback, otherwise e.g. "Madison Chakey"
          // and "Senator Carpenter" (different people, same last 4 of SSN)
          // get falsely linked as a reschedule.
          const exactKey = `${claimant.toLowerCase()}|${ssnFormatted}`;
          const origKey = `${baseName.toLowerCase()}|${ssnFormatted}`;
          let existing =
            byNameAndSsn.get(exactKey) || byNameAndSsn.get(origKey);
          if (!existing && fuzzy_name_match) {
            const ssnHit = bySsn.get(ssnFormatted);
            if (
              ssnHit &&
              trigramSimilarity(
                baseNameOf(claimant),
                baseNameOf(ssnHit.claimant),
              ) >= 0.5
            ) {
              existing = ssnHit;
            }
          }

          if (existing) {
            rescheduledRecords.push({
              row: rowOffset + rowIndex + 2,
              rowIndex: rowOffset + rowIndex,
              claimant,
              hearing_date: hearingDate,
              ssn: ssnFormatted,
              claim_type: claimType,
              claimantLocation,
              repLocation,
              downloadType,
              statusDate,
              is_rescheduled: true,
              original_id: existing.id,
              base_name: baseName,
              original_claimant: existing.claimant,
              original_date: existing.hearing_date,
              original_time: existing.hearing_time,
            });
            debugEntry.reason = "MATCHED as rescheduled";
            debugEntry.originalId = existing.id;
            debugResched.push(debugEntry);
            continue;
          } else {
            debugEntry.reason = "No original found in DB";
            debugEntry.exactKey = `${claimant.toLowerCase()}|${ssnFormatted}`;
            debugEntry.origKey = `${baseName.toLowerCase()}|${ssnFormatted}`;
            debugResched.push(debugEntry);
          }
        } else {
          debugEntry.reason = "Already imported (exact match exists)";
          debugResched.push(debugEntry);
        }
      }
      // If already imported or no original found, fall through to normal duplicate check
    }

    // ── Normal three-tier duplicate matching ──
    let existingId: number | null = null;

    // Try the CSV claimant as-is, then its base name (suffix stripped) so a
    // suffixed CSV name also matches a plain DB record. The DB side already
    // indexes base-name keys, so a plain CSV name matches a suffixed DB
    // record via the first lookup — this covers the reverse direction.
    const csvBase = baseNameOf(claimant);
    const csvHasSuffix = csvBase !== "" && csvBase !== claimant;

    if (ssnFormatted && hearingDate) {
      existingId =
        tier1.get(`${claimant}|${ssnFormatted}|${hearingDate}`) ??
        (csvHasSuffix
          ? tier1.get(`${csvBase}|${ssnFormatted}|${hearingDate}`)
          : undefined) ??
        null;
    }
    if (!existingId && ssnFormatted) {
      existingId =
        tier2.get(`${claimant}|${ssnFormatted}`) ??
        (csvHasSuffix ? tier2.get(`${csvBase}|${ssnFormatted}`) : undefined) ??
        null;
    }
    if (!existingId && hearingDate) {
      existingId =
        tier3.get(`${claimant}|${hearingDate}`) ??
        (csvHasSuffix ? tier3.get(`${csvBase}|${hearingDate}`) : undefined) ??
        null;
    }
    // Tier 4: SSN + date only — catches name typos (only when fuzzy matching enabled).
    // SSN-last-4 has only 4 digits of entropy so SSN+date collisions across
    // unrelated people on a busy hearing day are common. Require some name
    // overlap (trigram similarity ≥ 0.5) before accepting, otherwise e.g.
    // "Madison Chakey" and "Senator Carpenter" (different people, same last
    // 4 of SSN, same hearing date) get falsely linked.
    if (!existingId && fuzzy_name_match && ssnFormatted && hearingDate) {
      const tier4Hit = tier4.get(`${ssnFormatted}|${hearingDate}`) ?? null;
      if (tier4Hit) {
        const candidateName = baseNameOf(
          String(byId.get(tier4Hit)?.claimant || ""),
        );
        const csvName = baseNameOf(claimant) || claimant;
        if (trigramSimilarity(csvName, candidateName) >= 0.5) {
          existingId = tier4Hit;
        }
      }
    }

    // Disambiguate: tier2/3 match by name without checking date, so when a
    // person has multiple hearings (e.g. an older row + a renamed
    // "(Rescheduled)" row on a newer date), tier2 can pick the wrong one
    // because the CSV's plain claimant matches the OLDER, non-renamed row.
    // If we have a date in hand and the matched record's date doesn't
    // align, prefer tier4's ssn+date match — that fingerprint identifies
    // the specific hearing being referenced. Without this, "Update X
    // Rescheduled" could overwrite an old hearing with new-hearing data.
    // Same trigram guard as above to avoid swapping in an SSN-collision row.
    if (existingId && hearingDate && fuzzy_name_match && ssnFormatted) {
      const matched = byId.get(existingId);
      const matchedDate = String(matched?.hearing_date || "");
      if (matchedDate && matchedDate !== hearingDate) {
        const tier4Match = tier4.get(`${ssnFormatted}|${hearingDate}`);
        if (tier4Match && tier4Match !== existingId) {
          const candidateName = baseNameOf(
            String(byId.get(tier4Match)?.claimant || ""),
          );
          const csvName = baseNameOf(claimant) || claimant;
          if (trigramSimilarity(csvName, candidateName) >= 0.5) {
            existingId = tier4Match;
          }
        }
      }
    }

    // ── Archived-hearing match ──
    // If the matched record is an archived hearing, surface it as a
    // duplicate (so it's not re-imported as "new") and skip the field-diff —
    // archived rows carry only key columns. `matched_archived` lets the UI
    // flag it distinctly if desired.
    if (existingId !== null && archivedIds.has(existingId)) {
      duplicateRecords.push({
        row: rowOffset + rowIndex + 2,
        rowIndex: rowOffset + rowIndex,
        claimant,
        hearing_date: hearingDate,
        ssn: ssnFormatted,
        claim_type: claimType,
        claimantLocation,
        repLocation,
        downloadType,
        statusDate,
        existing_id: existingId,
        changed_fields: [],
        field_diffs: {},
        has_changes: false,
        matched_archived: true,
      });
      continue;
    }

    // ── Same-date time change → reschedule (not duplicate) ──
    // The suffix-based reschedule branch above only fires when the CSV's own
    // claimant has "(Rescheduled)". For rows where the DB record already
    // carries the suffix (e.g. an earlier reschedule) and the chronicle has
    // since updated the time, tier matching finds the row but it gets
    // bucketed as a Duplicate and the "Update X Rescheduled" button skips
    // it. Surface those as reschedules so they're updatable.
    if (existingId) {
      const dbRec = byId.get(existingId);
      const csvTimeRaw =
        mapping.hearing_time !== undefined
          ? String(row[mapping.hearing_time] || "").trim()
          : "";
      const csvTime = normalizeTime(csvTimeRaw);
      const dbTime = normalizeTime(String(dbRec?.hearing_time || ""));
      if (csvTime && dbTime && csvTime !== dbTime) {
        // CSV-compare-modal pre-tags rescheduled rows with "(Rescheduled)"
        // before sending the synthetic batch here, so `claimant` may already
        // carry the suffix. Strip it before stashing as `base_name` —
        // otherwise the client's renaming loop re-appends another
        // "(Rescheduled N)" and you end up with double suffixes.
        const baseName = claimant.replace(RESCHED_RE, "").trim() || claimant;
        rescheduledRecords.push({
          row: rowOffset + rowIndex + 2,
          rowIndex: rowOffset + rowIndex,
          claimant,
          hearing_date: hearingDate,
          ssn: ssnFormatted,
          claim_type: claimType,
          claimantLocation,
          repLocation,
          downloadType,
          statusDate,
          is_rescheduled: true,
          original_id: existingId,
          base_name: baseName,
          original_claimant: dbRec?.claimant,
          original_date: dbRec?.hearing_date,
          original_time: dbRec?.hearing_time,
        });
        continue;
      }
    }

    const record: Record<string, unknown> = {
      row: rowOffset + rowIndex + 2,
      rowIndex: rowOffset + rowIndex,
      claimant,
      hearing_date: hearingDate,
      ssn: ssnFormatted,
      claim_type: claimType,
      claimantLocation,
      repLocation,
      downloadType,
      statusDate,
      existing_id: existingId,
    };

    if (existingId) {
      // Diff: compare import values against existing DB record
      // We normalize the import value the SAME way the insert route transforms it,
      // then compare against what the DB actually has.
      const dbRec = byId.get(existingId);
      const changedFields: string[] = [];
      const fieldDiffs: Record<string, { old: string; new: string }> = {};
      if (dbRec) {
        const DATE_FIELDS = new Set([
          "hearing_date",
          "status_date",
          "entered_hearing_level_date",
          "post_hrg_deadline",
        ]);
        const TIME_FIELDS = new Set(["hearing_time", "converted_time_est"]);
        const BOOL_FIELDS = new Set([
          "phi_sheet_complete",
          "rep_docs_complete",
          "fee_agreement_complete",
          "five_day_notice",
          "task_assigned",
        ]);
        // Skip fields that map to different DB columns or need special lookup
        const SKIP_FIELDS = new Set(["medical_record_source", "claimant"]);
        const LOOKUP_FIELDS = new Set(["representative", "mr_team_id"]);

        const normalizeBool = (v: unknown): string => {
          if (v === true || v === "true" || v === "t" || v === "1" || v === 1)
            return "T";
          if (typeof v === "string" && v.toLowerCase() === "yes") return "T";
          return "F";
        };

        for (const [field, colIdx] of Object.entries(mapping) as [
          string,
          number,
        ][]) {
          if (colIdx === null || colIdx === undefined || colIdx < 0) continue;

          if (SKIP_FIELDS.has(field)) continue;
          const importVal = String(row[colIdx] ?? "").trim();
          if (!importVal) continue; // empty import value = no change

          // Lookup fields (representative, mr_team_id): only surface as a diff
          // when the DB side is empty and the sheet has a value — we can't do a
          // meaningful string comparison since DB stores an FK, not the display name.
          if (LOOKUP_FIELDS.has(field)) {
            const DB_FK_MAP: Record<string, string> = {
              representative: "assigned_rep_id",
              mr_team_id: "mr_team_id",
            };
            const dbFkCol = DB_FK_MAP[field] ?? field;
            const dbFkVal = dbRec[dbFkCol];
            const dbLookupEmpty =
              dbFkVal === null ||
              dbFkVal === undefined ||
              String(dbFkVal).trim() === "" ||
              String(dbFkVal).trim() === "0";

            if (field === "representative") {
              const importLower = importVal.toLowerCase().trim();

              // Withdrawal values → surface as assignment_status diff, not rep diff
              const isWdNeverAssigned =
                importLower === "wd - never assigned" ||
                importLower === "wd_never_assigned" ||
                importLower === "never assigned";
              const isWithdrawal =
                importLower === "withdrawal" ||
                importLower.startsWith("withdrawal -") ||
                importLower.startsWith("wd -");

              if (isWdNeverAssigned) {
                const dbStatus = String(
                  dbRec["assignment_status"] ?? "",
                ).trim();
                if (dbStatus !== "wd_never_assigned") {
                  changedFields.push("assignment_status");
                  fieldDiffs["assignment_status"] = {
                    old: dbStatus || "",
                    new: "wd_never_assigned",
                  };
                }
                continue;
              }

              if (isWithdrawal) {
                const dbStatus = String(
                  dbRec["assignment_status"] ?? "",
                ).trim();
                const dbDecision = String(
                  dbRec["hearing_decision_status"] ?? "",
                ).trim();
                const originalCase = importVal.trim();

                // Always surface assignment_status change if not already withdrawal
                if (
                  dbStatus !== "withdrawal" &&
                  dbStatus !== "wd_never_assigned"
                ) {
                  changedFields.push("assignment_status");
                  fieldDiffs["assignment_status"] = {
                    old: dbStatus || "",
                    new: "withdrawal",
                  };
                }

                // Only emit hearing_decision_status diff when the sheet value is a
                // SPECIFIC withdrawal type (e.g. "Withdrawal - No Contact"), not the
                // generic "WITHDRAWAL" / "WD" string which belongs on assignment_status only.
                const isSpecificWithdrawalType =
                  importLower.startsWith("withdrawal -") ||
                  importLower.startsWith("wd -");
                if (isSpecificWithdrawalType) {
                  if (dbDecision.toLowerCase() !== importLower) {
                    fieldDiffs["hearing_decision_status"] = {
                      old: dbDecision || "",
                      new: originalCase,
                    };
                    if (!changedFields.includes("hearing_decision_status")) {
                      changedFields.push("hearing_decision_status");
                    }
                  }
                }
                continue;
              }

              // Skip other non-name placeholders
              const NON_REP_VALUES = new Set([
                "not assigned",
                "unassigned",
                "n/a",
                "none",
                "—",
                "-",
                "pending",
                "tbd",
              ]);
              if (NON_REP_VALUES.has(importLower)) {
                continue;
              }

              // Real rep name → resolve to id and compare against the FK.
              // If the sheet name doesn't match any DB rep, collect fuzzy
              // suggestions (returned at top-level for the UI to surface as
              // "did you mean ...?") and skip the FK diff — we can't write a
              // bad FK on a guess.
              const importRepId = repByName.get(importLower) ?? null;
              if (importRepId === null) {
                computeRepSuggestions(importVal.trim());
                continue;
              }
              const dbRepId = dbLookupEmpty ? null : Number(dbFkVal);
              if (dbRepId === importRepId) continue;
              const dbDisplay = dbRepId ? repById.get(dbRepId) || "" : "";
              changedFields.push(field);
              fieldDiffs[field] = {
                old: dbDisplay,
                new: repById.get(importRepId) || importVal,
              };
              continue;
            }

            // mr_team_id: resolve team name → id, compare against FK column
            if (field === "mr_team_id") {
              const importTeamId =
                teamByName.get(importVal.toLowerCase().trim()) ?? null;
              if (importTeamId === null) continue;
              const dbTeamId = dbLookupEmpty ? null : Number(dbFkVal);
              if (dbTeamId === importTeamId) continue;
              const oldDisplay = dbTeamId ? teamById.get(dbTeamId) || "" : "";
              changedFields.push(field);
              fieldDiffs[field] = {
                old: oldDisplay,
                new: teamById.get(importTeamId) || importVal,
              };
              continue;
            }

            // Other lookup fields (none currently) — fall back to empty-only emission
            if (dbLookupEmpty) {
              changedFields.push(field);
              fieldDiffs[field] = { old: "", new: importVal };
            }
            continue;
          }
          const dbRaw = dbRec[field];
          // If DB value is null/empty and import has a value → that's a real change
          // const dbIsEmpty =
          //   dbRaw === null ||
          //   dbRaw === undefined ||
          //   String(dbRaw).trim() === "";

          // if (dbIsEmpty) {
          //   // DB is empty, import has value — skip (not a real "change")
          //   continue;
          // }
          const dbIsEmpty =
            dbRaw === null ||
            dbRaw === undefined ||
            String(dbRaw).trim() === "";

          // DB is empty, import has a value → this IS a real change (filling in a blank)
          // if (dbIsEmpty) {
          //   changedFields.push(field);
          //   fieldDiffs[field] = { old: "", new: importVal };
          //   continue;
          // }
          if (dbIsEmpty) {
            // For date fields, validate the import value is actually a parseable date
            // before treating it as a diff — prevents free text (e.g. "CE ordered")
            // in a date column from being flagged as a deadline change.
            if (DATE_FIELDS.has(field)) {
              console.log(`DATE_FIELD_DEBUG field=${field} val="${importVal}"`);
              const cleanVal = importVal.replace(/[.,;]+$/, "").trim();
              const parsedImport = parseDate(cleanVal);
              console.log(`DATE_FIELD_DEBUG parsed="${parsedImport}"`);
              if (!parsedImport) continue;
              changedFields.push(field);
              fieldDiffs[field] = { old: "", new: parsedImport };
              continue;
            }
            changedFields.push(field);
            fieldDiffs[field] = { old: "", new: importVal };
            continue;
          }

          let normImport: string;
          let normDb: string;

          if (DATE_FIELDS.has(field)) {
            normImport = parseDate(importVal) || "";
            normDb = parseDate(String(dbRaw)) || String(dbRaw).trim();
            if (!normImport) continue; // unparseable import date — skip
          } else if (TIME_FIELDS.has(field)) {
            normImport = normalizeTime(importVal);
            normDb = normalizeTime(String(dbRaw));
          } else if (field === "ssn_last_4") {
            normImport = importVal.replace(/\D/g, "").slice(-4);
            normDb = String(dbRaw).replace(/\D/g, "").slice(-4);
          } else if (BOOL_FIELDS.has(field)) {
            normImport = normalizeBool(importVal);
            normDb = normalizeBool(dbRaw);
          } else {
            // Plain string — normalize hidden XLSX chars (non-breaking spaces, zero-width, \r)
            normImport = importVal
              .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF\r]+/g, " ")
              .trim();
            normDb = String(dbRaw)
              .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF\r]+/g, " ")
              .trim();
          }

          if (normImport.toLowerCase() !== normDb.toLowerCase()) {
            changedFields.push(field);
            fieldDiffs[field] = { old: String(dbRaw).trim(), new: importVal };
          }
        }
        // ── Post HRG Notes from cell comments ──
        if (dbRec && mapping.post_hrg_deadline !== undefined) {
          const deadlineColIdx = mapping.post_hrg_deadline as number;
          const colToLetter = (idx: number): string => {
            let letter = "";
            let n = idx;
            while (n >= 0) {
              letter = String.fromCharCode(65 + (n % 26)) + letter;
              n = Math.floor(n / 26) - 1;
            }
            return letter;
          };
          const colLetter = colToLetter(deadlineColIdx);
          const cellRef = `${colLetter}${rowOffset + rowIndex + 2}`;
          const commentText = (comments as Record<string, string>)[cellRef];

          if (commentText && commentText.trim()) {
            const dbNotesRaw = dbRec["post_hrg_notes"];
            const dbNotesStr = dbNotesRaw ? String(dbNotesRaw).trim() : "";

            // Parse existing DB notes array
            let existingNotes: { user: string; date: string; note: string }[] =
              [];
            try {
              const parsed = JSON.parse(dbNotesStr);
              if (Array.isArray(parsed)) existingNotes = parsed;
            } catch {
              // plain text or empty
            }

            // Strip "[Author - Date] " or "[Author] " prefix from a comment line
            const stripPrefix = (line: string): string =>
              line.replace(/^\[.*?\]\s*/, "").trim();

            // Split multi-reply comment into individual lines and strip prefixes
            const commentLines = commentText
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .map(stripPrefix)
              .filter(Boolean);

            // Normalize text for comparison — strips mojibake, normalizes whitespace
            const normalizeNoteText = (text: string): string => {
              return text
                .replace(/\u00C2\u00A0/g, " ") // Â + NBSP mojibake pair
                .replace(/\u00A0/g, " ") // non-breaking space
                .replace(/\u00C2/g, "") // lone Â mojibake
                .replace(/Â/g, "") // literal Â character
                .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
                .replace(/[\u{1F000}-\u{1FFFF}]/gu, "") // emoji (astral plane)
                .replace(/[\uD800-\uDFFF]/g, "") // surrogate pairs
                .replace(/ð[\x80-\xBF]{3}/g, "") // mangled emoji (ð???)
                .replace(/&amp;/g, "&") // HTML entities
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&nbsp;/g, " ")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();
            };

            // Find lines that are NOT already in DB notes
            const existingNoteTexts = new Set(
              existingNotes.map((n) => normalizeNoteText(n.note)),
            );
            const newLines = commentLines.filter(
              (line) => !existingNoteTexts.has(normalizeNoteText(line)),
            );

            if (newLines.length > 0) {
              // Only flag the NEW lines as the diff
              changedFields.push("post_hrg_notes");
              fieldDiffs["post_hrg_notes"] = {
                old: dbNotesStr || "",
                new: newLines.join("\n"), // only the new content
              };
            }
          }
        }
      }
      record.changed_fields = changedFields;
      record.field_diffs = fieldDiffs;
      record.has_changes = changedFields.length > 0;
      duplicateRecords.push(record);
    } else {
      newRecords.push(record);
    }
  }

  // Build summary of which fields trigger changes most often
  const fieldChangeCounts: Record<string, number> = {};
  for (const rec of duplicateRecords) {
    const cf = rec.changed_fields as string[] | undefined;
    if (cf)
      for (const f of cf)
        fieldChangeCounts[f] = (fieldChangeCounts[f] || 0) + 1;
  }

  // Surface fuzzy "did you mean ...?" candidates for any sheet rep name
  // that didn't match the canonical name OR any alias. UI can render these
  // in the preview so an admin can either confirm an alias or import the
  // row knowing the rep won't be auto-resolved.
  const rep_name_suggestions = Array.from(repNameSuggestions.entries()).map(
    ([csvName, candidates]) => ({ csv_name: csvName, candidates }),
  );

  return NextResponse.json({
    success: true,
    total: rows.length,
    new_count: newRecords.length,
    duplicate_count: duplicateRecords.length,
    duplicates_with_changes: duplicateRecords.filter((r) => r.has_changes)
      .length,
    // Subset of duplicate_records that matched an archived hearing rather
    // than an active one — surfaced so the UI can call them out if needed.
    archived_matched_count: duplicateRecords.filter((r) => r.matched_archived)
      .length,
    skipped_count: skippedRecords.length,
    rescheduled_count: rescheduledRecords.length,
    field_change_summary: fieldChangeCounts,
    new_records: newRecords,
    duplicate_records: duplicateRecords,
    skipped_records: skippedRecords,
    rescheduled_records: rescheduledRecords,
    rep_name_suggestions,
    debug_rescheduled: debugResched,
  });
}
