#!/bin/bash

# Define the absolute path to your backend directory
BOT_DIR="/Users/apple/Work/Personal/opensource/whatsapp-ai-filter/core"
PM2_APP_NAME="whatsapp-ai-filter"

echo "--- Starting update process for ${PM2_APP_NAME} at $(date) ---"

# Change to the bot's backend directory
cd "$BOT_DIR" || { echo "ERROR: Failed to change directory to $BOT_DIR. Exiting." && exit 1; }

echo "Pulling latest changes from main branch..."
git pull origin main
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to update the repository. Please check your network connection or repository access."
    exit 1
fi
echo "Repository updated successfully."

echo "Installing/updating dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies. Please check your npm configuration or network."
    exit 1
fi
echo "Dependencies installed successfully."

echo "Building the project..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build the project. Please check your build configuration or source code."
    exit 1
fi
echo "Project built successfully."

echo "Restarting the ${PM2_APP_NAME} service via PM2..."
pm2 restart "${PM2_APP_NAME}"
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to restart the ${PM2_APP_NAME} service. Please check your PM2 configuration or bot status."
    exit 1
fi
echo "${PM2_APP_NAME} service restarted successfully."
echo "--- Update process completed successfully for ${PM2_APP_NAME} ---"