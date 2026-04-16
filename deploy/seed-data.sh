#!/bin/bash
# Copy local hiregraph data into the deploy directory for Docker build
# Run this before deploying to Railway

HIREGRAPH_DIR="$HOME/.hiregraph"
DEPLOY_DIR="$(dirname "$0")/hiregraph-data"

mkdir -p "$DEPLOY_DIR/recipes" "$DEPLOY_DIR/resumes"

# Copy essential files
cp "$HIREGRAPH_DIR/identity.json" "$DEPLOY_DIR/" 2>/dev/null && echo "✓ identity.json"
cp "$HIREGRAPH_DIR/answers.json" "$DEPLOY_DIR/" 2>/dev/null && echo "✓ answers.json"
cp "$HIREGRAPH_DIR/history.json" "$DEPLOY_DIR/" 2>/dev/null && echo "✓ history.json"
cp "$HIREGRAPH_DIR/recipes/"*.json "$DEPLOY_DIR/recipes/" 2>/dev/null && echo "✓ recipes"

# Copy resume PDF (use resume_path from identity.json if available)
RESUME_PATH=$(node -e "try{const i=JSON.parse(require('fs').readFileSync('$HIREGRAPH_DIR/identity.json','utf8'));if(i.resume_path)console.log(i.resume_path)}catch{}" 2>/dev/null)
if [ -n "$RESUME_PATH" ] && [ -f "$RESUME_PATH" ]; then
  cp "$RESUME_PATH" "$DEPLOY_DIR/resume.pdf" 2>/dev/null && echo "✓ resume.pdf"
elif [ -f "$DEPLOY_DIR/resume.pdf" ]; then
  echo "✓ resume.pdf (already present)"
fi

echo ""
echo "Data copied to $DEPLOY_DIR"
echo "These will be baked into the Docker image on next deploy."
