#!/bin/bash
echo "🚀 MapSnap GPX publiceren naar permanente Firebase Cloud Hosting..."
npx firebase-tools login
npx firebase-tools deploy --only hosting
