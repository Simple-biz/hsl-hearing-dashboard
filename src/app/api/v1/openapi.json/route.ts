// GET /api/v1/openapi.json — public OpenAPI 3.1 specification for the v1 API.
//
// Intentionally unauthenticated: the spec describes endpoint shapes, not
// data. Phase 3's docs site (Scalar at /dev-docs) reads this URL to render
// the interactive reference. External tooling (codegen, Postman import,
// etc.) can also consume it directly.

import { openApiSpec } from "@/lib/openapi-spec";

export function GET() {
  return Response.json(openApiSpec, {
    headers: {
      // Allow sister projects to fetch the spec from a browser (e.g. an
      // internal docs portal) without same-origin restrictions.
      "Access-Control-Allow-Origin": "*",
      // Short cache so updates appear quickly during active iteration.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
