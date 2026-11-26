#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../tools/v341_docker_images.sh
source "$repo_root/tools/v341_docker_images.sh"

passed=0
failed=0
assert_true() {
  local name="$1"
  shift
  if "$@"; then
    printf 'ok - %s\n' "$name"
    passed=$((passed + 1))
  else
    printf 'not ok - %s\n' "$name" >&2
    failed=$((failed + 1))
  fi
}

assert_false() {
  local name="$1"
  shift
  if "$@"; then
    printf 'not ok - %s\n' "$name" >&2
    failed=$((failed + 1))
  else
    printf 'ok - %s\n' "$name"
    passed=$((passed + 1))
  fi
}

observed='public.ecr.aws/supabase/postgrest:v16.6'
if ! v341_parse_docker_image_ref "$observed"; then
  printf 'not ok - observed CI image parses\n' >&2
  exit 1
fi
assert_true 'observed CI reference components match exactly' v341_postgrest_reference_ok
[[ "$V341_IMAGE_REGISTRY" == public.ecr.aws ]]
[[ "$V341_IMAGE_REPOSITORY" == supabase/postgrest ]]
[[ "$V341_IMAGE_TAG" == v16.6 ]]
assert_true 'observed CI image is a PostgREST candidate' v341_is_postgrest_candidate

if v341_parse_docker_image_ref 'public.ecr.aws/supabase/postgrest:v16.6@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; then
  assert_true 'valid sha256 digest preserves exact pinned components' v341_postgrest_reference_ok
  [[ "$V341_IMAGE_DIGEST" == sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ]]
else
  printf 'not ok - valid digest reference parses\n' >&2
  failed=$((failed + 1))
fi

if v341_parse_docker_image_ref 'public.ecr.aws/supabase/postgrest:v16.6.1'; then
  assert_true 'wrong tag remains identifiable as PostgREST' v341_is_postgrest_candidate
  assert_false 'wrong tag is rejected' v341_postgrest_tag_ok
  assert_false 'wrong tag fails full pinned reference check' v341_postgrest_reference_ok
else
  printf 'not ok - wrong tag parses for component diagnosis\n' >&2
  failed=$((failed + 1))
fi

if v341_parse_docker_image_ref 'public.ecr.aws/supabase/postgrest-alt:v16.6'; then
  assert_false 'wrong repository is rejected' v341_postgrest_repository_ok
  assert_false 'wrong repository fails full pinned reference check' v341_postgrest_reference_ok
else
  printf 'not ok - wrong repository parses for component diagnosis\n' >&2
  failed=$((failed + 1))
fi

if v341_parse_docker_image_ref 'ghcr.io/supabase/postgrest:v16.6'; then
  assert_false 'wrong registry is rejected' v341_postgrest_registry_ok
  assert_false 'wrong registry fails full pinned reference check' v341_postgrest_reference_ok
else
  printf 'not ok - wrong registry parses for component diagnosis\n' >&2
  failed=$((failed + 1))
fi

duplicate_count="$(v341_count_postgrest_candidates \
  'public.ecr.aws/supabase/postgrest:v16.6' \
  'public.ecr.aws/supabase/postgrest:v16.6' \
  'public.ecr.aws/supabase/postgres:17.12.0.002' \
  'public.ecr.aws/supabase/gotrue:v2.198.0')"
[[ "$duplicate_count" == 2 ]]
assert_false 'duplicate PostgREST images are counted by the workflow helper and rejected' v341_exactly_one_postgrest_candidate "$duplicate_count"
assert_false 'missing PostgREST image candidate fails closed' v341_exactly_one_postgrest_candidate 0

invalid_refs=(
  'https://u@public.ecr.aws/supabase/postgrest:v16.6'
  'public.ecr.aws/supabase/postgrest:v16.6;echo unsafe'
  'public.ecr.aws/supabase/postgrest:v16.6 with-space'
  'public.ecr.aws/supabase/postgrest:v16.6@sha256:not-a-digest'
  '$(id):v16.6'
)
for invalid_ref in "${invalid_refs[@]}"; do
  assert_false 'invalid image reference is rejected by allowlist' v341_parse_docker_image_ref "$invalid_ref"
done

printf 'Bash parser tests: passed=%s failed=%s\n' "$passed" "$failed"
[[ "$failed" -eq 0 ]]
