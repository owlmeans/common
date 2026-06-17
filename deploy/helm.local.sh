#!/bin/sh

SCRIPT_DIR="$PWD"

echo "Loading environment variables from $SCRIPT_DIR/.env"

set -a
. "$SCRIPT_DIR/.env"
set +a

helm upgrade --install common-build "$BUILDER_PATH" \
  --namespace builders \
  --create-namespace \
  --atomic \
  --wait \
  --timeout 5m \
  --values "$SCRIPT_DIR/dev.values.yaml"