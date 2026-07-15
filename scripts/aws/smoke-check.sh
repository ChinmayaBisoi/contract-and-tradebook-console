#!/usr/bin/env bash

set -euo pipefail

: "${CLOUDFRONT_URL:?CLOUDFRONT_URL is required}"

app_root_marker="${APP_ROOT_MARKER:-ContractView}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

health_headers="${tmp_dir}/health.headers"
health_body="${tmp_dir}/health.body"
root_headers="${tmp_dir}/root.headers"
root_body="${tmp_dir}/root.body"

curl --fail --silent --show-error \
  --dump-header "${health_headers}" \
  --output "${health_body}" \
  "${CLOUDFRONT_URL%/}/api/health"

grep -q "200" "${health_headers}"
grep -q '"ok":true' "${health_body}"
grep -q '"service":"contractview"' "${health_body}"

curl --fail --silent --show-error \
  --dump-header "${root_headers}" \
  --output "${root_body}" \
  "${CLOUDFRONT_URL%/}/"

grep -q "200" "${root_headers}"
grep -q "${app_root_marker}" "${root_body}"

echo "Smoke check passed for ${CLOUDFRONT_URL}"
