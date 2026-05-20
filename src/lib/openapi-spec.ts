// OpenAPI 3.1 specification for the HSL Hearing Dashboard v1 REST API.
//
// This is the single source of truth for the public API contract. Phase 3
// renders it as a docs page via Scalar. External tooling (codegen, Postman
// import, etc.) can consume it directly at /api/v1/openapi.json.
//
// When you add or change a route under src/app/api/v1, update this file in
// the same commit so the spec doesn't drift.

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "HSL Hearing Dashboard API",
    version: "1.0.0",
    description: [
      "Read-only REST API for sister projects that consume hearing-related",
      "data from the HSL Hearing Dashboard.",
      "",
      "**Authentication.** All endpoints require an API key. Pass it in the",
      "`X-API-Key` header, or as a bearer token (`Authorization: Bearer <key>`).",
      "Keys are minted by a system_admin in the dashboard at `/api-keys` and",
      "the plaintext is shown exactly once — store it in your own secret",
      "manager immediately.",
      "",
      "**Conventions.** All timestamps are ISO 8601. Dates are `YYYY-MM-DD`.",
      "Booleans are real JSON `true`/`false`. Nulls are explicit nulls, not",
      "empty strings. List endpoints paginate via `page` / `per_page` query",
      "params and return `{ data, pagination }`. Errors use the shape",
      "`{ error: { code, message } }`.",
    ].join("\n"),
    contact: {
      name: "HSL Hearing Dashboard",
    },
  },

  servers: [
    {
      url: "/api/v1",
      description: "Same-origin (relative URL)",
    },
  ],

  security: [{ apiKeyHeader: [] }, { bearerAuth: [] }],

  tags: [
    {
      name: "Hearings",
      description:
        "Hearing records — the canonical entity. One row per hearing event.",
    },
    {
      name: "Representatives",
      description:
        "Representative roster — lookup endpoint for resolving rep IDs.",
    },
  ],

  paths: {
    "/hearings": {
      get: {
        tags: ["Hearings"],
        summary: "List hearings",
        description:
          "Returns a paginated list of hearings with optional filters. Sorted by `hearing_date` descending, then `id` descending.",
        parameters: [
          {
            name: "from_date",
            in: "query",
            schema: { type: "string", format: "date" },
            description:
              "Inclusive lower bound on `hearing_date` (YYYY-MM-DD).",
            example: "2026-05-01",
          },
          {
            name: "to_date",
            in: "query",
            schema: { type: "string", format: "date" },
            description:
              "Inclusive upper bound on `hearing_date` (YYYY-MM-DD).",
            example: "2026-05-31",
          },
          {
            name: "rep_id",
            in: "query",
            schema: { type: "integer", minimum: 1 },
            description:
              "Filter to hearings where `assigned_rep_id` matches this representative.",
            example: 42,
          },
          {
            name: "status",
            in: "query",
            schema: { type: "string" },
            description:
              "Exact match against `hearing_decision_status` (e.g. `Favorable`, `Unfavorable`, `Withdrawal - Claimant`).",
            example: "Favorable",
          },
          {
            name: "search",
            in: "query",
            schema: { type: "string" },
            description:
              "Case-insensitive substring match against `claimant`.",
            example: "smith",
          },
          {
            name: "ssn_last_4",
            in: "query",
            schema: { type: "string", pattern: "^[0-9]{4}$" },
            description:
              "Exact match against `ssn_last_4`. Useful for looking up a specific claimant when the name is ambiguous or unknown.",
            example: "1234",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
            description: "1-based page number.",
          },
          {
            name: "per_page",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 200,
              default: 50,
            },
            description: "Page size. Capped at 200.",
          },
        ],
        responses: {
          "200": {
            description: "Paginated list of hearings.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HearingListResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    "/hearings/{id}": {
      get: {
        tags: ["Hearings"],
        summary: "Get one hearing",
        description: "Returns a single hearing by primary key.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
            description: "Hearing primary key.",
            example: 1234,
          },
        ],
        responses: {
          "200": {
            description: "The hearing.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HearingSingleResponse" },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },

    "/representatives": {
      get: {
        tags: ["Representatives"],
        summary: "List representatives",
        description:
          "Returns all representatives, ordered alphabetically by name. Useful for resolving `assigned_rep_id` → display name or populating a dropdown in a sister project.",
        parameters: [
          {
            name: "include_inactive",
            in: "query",
            schema: { type: "boolean", default: false },
            description:
              "When `true`, includes revoked/inactive representatives in the response.",
          },
        ],
        responses: {
          "200": {
            description: "List of representatives.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RepresentativeListResponse",
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },

  components: {
    securitySchemes: {
      apiKeyHeader: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key minted in the dashboard at `/api-keys`.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Alternative to `X-API-Key`. The same key value, sent as `Authorization: Bearer <key>`.",
      },
    },

    responses: {
      Unauthorized: {
        description:
          "Missing or invalid API key (header absent, hash mismatch, key revoked, or expired).",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "unauthorized",
                message:
                  "Missing or invalid API key. Pass it in the X-API-Key header or as 'Authorization: Bearer <key>'.",
              },
            },
          },
        },
      },
      BadRequest: {
        description: "Malformed request (e.g. non-numeric path parameter).",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "bad_request",
                message: "Hearing id must be a positive integer.",
              },
            },
          },
        },
      },
      NotFound: {
        description: "No row matches the requested identifier.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: { code: "not_found", message: "Hearing 99999 not found." },
            },
          },
        },
      },
      InternalError: {
        description: "Unexpected server error.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            example: {
              error: {
                code: "internal_error",
                message: "Failed to fetch hearings.",
              },
            },
          },
        },
      },
    },

    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                description:
                  "Machine-readable error code. Stable across versions for the same condition.",
                enum: [
                  "unauthorized",
                  "bad_request",
                  "not_found",
                  "internal_error",
                ],
              },
              message: {
                type: "string",
                description: "Human-readable description of the error.",
              },
            },
          },
        },
      },

      Pagination: {
        type: "object",
        required: ["page", "per_page", "total", "total_pages"],
        properties: {
          page: { type: "integer", description: "Current 1-based page." },
          per_page: { type: "integer", description: "Page size used." },
          total: {
            type: "integer",
            description: "Total matching rows across all pages.",
          },
          total_pages: {
            type: "integer",
            description: "Number of pages. At least 1 even when total is 0.",
          },
        },
      },

      Hearing: {
        type: "object",
        description:
          "A single hearing event with its representative, MR team, and workflow checkpoints. Internal-only columns (deadline_prev, download_type, editor state) are intentionally omitted to keep the public contract stable.",
        properties: {
          id: { type: "integer" },
          claimant: { type: ["string", "null"] },
          ssn_last_4: { type: ["string", "null"] },
          claim_type: { type: ["string", "null"] },
          hearing_date: {
            type: ["string", "null"],
            format: "date",
            description: "YYYY-MM-DD.",
          },
          hearing_time: { type: ["string", "null"] },
          time_zone: { type: ["string", "null"] },
          converted_time_est: { type: ["string", "null"] },
          city: { type: ["string", "null"] },
          state: { type: ["string", "null"] },
          alj: {
            type: ["string", "null"],
            description: "Administrative Law Judge name.",
          },
          manner_of_appearance: {
            type: ["string", "null"],
            description: "e.g. Video, Phone, In-Person.",
          },
          hearing_decision_status: {
            type: ["string", "null"],
            description:
              "e.g. Favorable, Unfavorable, Withdrawal - Claimant, etc.",
          },
          assignment_status: {
            type: ["string", "null"],
            description: "withdrawal, wd_never_assigned, or null.",
          },
          assigned_rep_id: { type: ["integer", "null"] },
          rep_name: {
            type: ["string", "null"],
            description: "Joined from `representatives.name`.",
          },
          mr_team_id: { type: ["integer", "null"] },
          mr_team_name: {
            type: ["string", "null"],
            description: "Joined from `mr_teams.team_name`.",
          },
          medical_record_status: { type: ["string", "null"] },
          medical_record_link: { type: ["string", "null"], format: "uri" },
          claimant_link: { type: ["string", "null"], format: "uri" },
          chronicle_link: { type: ["string", "null"], format: "uri" },

          task_assigned: { type: "boolean" },
          task_assigned_at: {
            type: ["string", "null"],
            format: "date-time",
            description:
              "Timestamp set when task_assigned was checked. Cleared on uncheck.",
          },
          rep_docs_complete: { type: "boolean" },
          rep_docs_complete_at: { type: ["string", "null"], format: "date-time" },
          rep_docs_assigned_to: { type: ["string", "null"] },
          fee_agreement_complete: { type: "boolean" },
          fee_agreement_complete_at: {
            type: ["string", "null"],
            format: "date-time",
          },
          five_day_notice: { type: "boolean" },
          five_day_notice_at: { type: ["string", "null"], format: "date-time" },
          phi_sheet_complete: { type: "boolean" },
          phi_sheet_complete_at: {
            type: ["string", "null"],
            format: "date-time",
          },

          post_hrg_review: { type: ["boolean", "null"] },
          post_hrg_deadline: { type: ["string", "null"], format: "date" },
          post_hrg_dev_status: {
            type: ["string", "null"],
            description:
              "Workflow status (Completed, Incomplete, Extended, Records Closed, Continued). Shares the same option list as post_hrg_development.status.",
          },
          post_hrg_report: { type: "boolean" },
          post_hrg_report_at: {
            type: ["string", "null"],
            format: "date-time",
          },
        },
      },

      HearingListResponse: {
        type: "object",
        required: ["data", "pagination"],
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Hearing" },
          },
          pagination: { $ref: "#/components/schemas/Pagination" },
        },
      },

      HearingSingleResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: { $ref: "#/components/schemas/Hearing" },
        },
      },

      Representative: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          rep_type: {
            type: ["string", "null"],
            description: "Internal categorisation tag, e.g. `staff`, `external`.",
          },
          is_active: { type: "boolean" },
        },
      },

      RepresentativeListResponse: {
        type: "object",
        required: ["data"],
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Representative" },
          },
        },
      },
    },
  },
} as const;
