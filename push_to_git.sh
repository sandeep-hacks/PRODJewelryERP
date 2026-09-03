#!/bin/bash
set -e

REPO_URL="https://github.com/sandeep-hacks/PRODJewelryERP.git"

echo "=================================================="
echo "🚀 Pushing Jewellery ERP to GitHub..."
echo "👉 Target: $REPO_URL"
echo "=================================================="

# Set or add remote origin
if git remote | grep -q origin; then
    git remote set-url origin "$REPO_URL"
else
    git remote add origin "$REPO_URL"
fi

# Ensure branch is main
git branch -M main

# Stage and commit changes
git add .
git commit -m "Production ready: Flipkart showcase, ImageKit cloud upload, mobile UI, Vercel & Render configs" || echo "No new changes to commit."

# Push to main branch
git push -u origin main

echo ""
echo "=================================================="
echo "✅ Successfully pushed to GitHub!"
echo "👉 https://github.com/sandeep-hacks/PRODJewelryERP"
echo "=================================================="
