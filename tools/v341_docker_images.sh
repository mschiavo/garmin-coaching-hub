#!/usr/bin/env bash
# Shared by the E2E workflow and its Docker-free Bash regression tests.

V341_DOCKER_REF_RE='^([A-Za-z0-9.-]+(:[0-9]+)?/)?[a-z0-9]+([._-][a-z0-9]+)*(\/[a-z0-9]+([._-][a-z0-9]+)*)*(:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(@sha256:[a-f0-9]{64})?$'

v341_parse_docker_image_ref() {
  local ref="${1-}"
  local ref_without_digest first_component image_leaf

  [[ "$ref" =~ $V341_DOCKER_REF_RE ]] || return 1

  V341_IMAGE_REFERENCE="$ref"
  V341_IMAGE_DIGEST=""
  if [[ "$ref" == *@* ]]; then
    V341_IMAGE_DIGEST="${ref#*@}"
  fi
  ref_without_digest="${ref%%@*}"

  first_component="${ref_without_digest%%/*}"
  if [[ "$ref_without_digest" == */* && ( "$first_component" == *.* || "$first_component" == *:* || "$first_component" == localhost ) ]]; then
    V341_IMAGE_REGISTRY="$first_component"
    V341_IMAGE_REPOSITORY="${ref_without_digest#*/}"
  else
    V341_IMAGE_REGISTRY="docker.io"
    V341_IMAGE_REPOSITORY="$ref_without_digest"
  fi

  image_leaf="${V341_IMAGE_REPOSITORY##*/}"
  if [[ "$image_leaf" == *:* ]]; then
    V341_IMAGE_TAG="${image_leaf##*:}"
    V341_IMAGE_REPOSITORY="${V341_IMAGE_REPOSITORY%:*}"
  else
    V341_IMAGE_TAG=""
  fi
}

v341_is_postgrest_candidate() {
  [[ "${V341_IMAGE_REPOSITORY##*/}" == postgrest || "$V341_IMAGE_TAG" == v16.6 ]]
}

v341_postgrest_registry_ok() {
  [[ "$V341_IMAGE_REGISTRY" == public.ecr.aws ]]
}

v341_postgrest_repository_ok() {
  [[ "$V341_IMAGE_REPOSITORY" == supabase/postgrest ]]
}

v341_postgrest_tag_ok() {
  [[ "$V341_IMAGE_TAG" == v16.6 ]]
}

v341_postgrest_reference_ok() {
  v341_postgrest_registry_ok && v341_postgrest_repository_ok && v341_postgrest_tag_ok
}

v341_exactly_one_postgrest_candidate() {
  [[ "${1-}" == 1 ]]
}

v341_count_postgrest_candidates() {
  local ref count=0
  for ref in "$@"; do
    v341_parse_docker_image_ref "$ref" || return 2
    if v341_is_postgrest_candidate; then
      count=$((count + 1))
    fi
  done
  printf '%s\n' "$count"
}
