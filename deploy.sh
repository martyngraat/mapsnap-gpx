#!/bin/bash
echo "🚀 GeoForge Navigator publiceren naar GitHub Pages..."
git add .
git commit -m "Deploy update via deploy.sh"
npx gh-pages -d .
