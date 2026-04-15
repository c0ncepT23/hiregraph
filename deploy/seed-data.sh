#!/bin/bash
# Copy local hiregraph data into the deploy directory for Docker build
# Run this before deploying to Railway

HIREGRAPH_DIR="$HOME/.hiregraph"
DEPLOY_DIR="$(dirname "$0")/hiregraph-data"

mkdir -p "$DEPLOY_DIR/recipes"

# Copy essential files
cp "$HIREGRAPH_DIR/identity.json" "$DEPLOY_DIR/" 2>/dev/null && echo "✓ identity.json"
cp "$HIREGRAPH_DIR/answers.json" "$DEPLOY_DIR/" 2>/dev/null && echo "✓ answers.json"
cp "$HIREGRAPH_DIR/history.json" "$DEPLOY_DIR/" 2>/dev/null && echo "✓ history.json"
cp "$HIREGRAPH_DIR/recipes/"*.json "$DEPLOY_DIR/recipes/" 2>/dev/null && echo "✓ recipes"

echo ""
echo "Data copied to $DEPLOY_DIR"
echo "These will be baked into the Docker image on next deploy."
