"use client";

// Public developer documentation site for the HSL Hearing Dashboard v1
// REST API. Renders Scalar's three-pane reference UI (sidebar nav,
// endpoint detail, code-sample panel) from the live OpenAPI spec served
// at /api/v1/openapi.json.
//
// Public on purpose — the spec describes endpoint shapes, not data, and
// sister-project devs need to read the contract before they can integrate.
// All actual data access still requires an X-API-Key (see /api-keys).

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export default function DevDocsPage() {
  return (
    <ApiReferenceReact
      configuration={{
        // The spec is served live from the same origin so the docs always
        // reflect the deployed API surface — no separate spec to maintain.
        url: "/api/v1/openapi.json",
        // Visual theme. "purple" matches the dashboard's accent palette;
        // change to "default", "kepler", "moon", "saturn" etc. if you
        // prefer a different look.
        theme: "purple",
        // Hide the Scalar branding badge in the bottom corner.
        hideClientButton: false,
        metaData: {
          title: "HSL Hearing Dashboard API — Developer Docs",
          description:
            "Read-only REST API for sister projects that consume hearing-related data from the HSL Hearing Dashboard.",
        },
      }}
    />
  );
}
