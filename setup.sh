#!/bin/bash

# --- Configuration ---
# This assumes setup.sh is in the project root directory
PROJECT_ROOT_DIR="$(dirname "$(readlink -f "$0")")"
CORE_DIR="$PROJECT_ROOT_DIR/core"
PM2_APP_NAME="whatsapp-ai-filter"
ECOSYSTEM_CONFIG_FILE="ecosystem.config.js" # Ensure this matches your file name

echo "--- Starting WhatsApp AI Filter Bot Setup ---"
echo "This script will guide you through setting up the bot on a Unix-like system (Linux, macOS, WSL)."
echo "--------------------------------------------------"

# Step 1: Navigate to the core directory
echo "Step 1/6: Navigating to the core directory..."
cd "$CORE_DIR" || { echo "ERROR: Could not change to directory $CORE_DIR. Please ensure '$CORE_DIR' exists. Exiting." && exit 1; }
echo "Currently in: $(pwd)"

# Step 2: Install Node.js dependencies
echo -e "\nStep 2/6: Installing Node.js dependencies (this may take a moment)..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Node.js dependencies. Please check your network connection and npm configuration."
    exit 1
fi
echo "Node.js dependencies installed successfully."

# Step 3: Build the project
echo -e "\nStep 3/6: Building the TypeScript project..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build the project. Please ensure TypeScript is correctly configured and your source code is valid."
    exit 1
fi
echo "Project built successfully."

# Step 4: PM2 Installation Check and Guidance
echo -e "\nStep 4/6: Checking for PM2 installation..."
if ! command -v pm2 &> /dev/null
then
    echo "PM2 is not installed globally."
    echo "Please install it by running: 'npm install -g pm2'"
    echo "You might need 'sudo' for global install: 'sudo npm install -g pm2'"
    echo "Exiting now. Please install PM2 and run this script again."
    exit 1
fi
echo "PM2 found."

# Step 5: Collect Environment Variables and Create .env file
echo -e "\nStep 5/6: Configuring Environment Variables..."
echo "Please provide your API keys for the bot to function."
echo "Your input will be hidden for security."

# Prompt for OPENAI_API_KEY
OPENAI_KEY=""
while [ -z "$OPENAI_KEY" ]; do
    read -s -p "Enter your OpenAI API Key (e.g., sk-xxxxxxxxxxxxxxxxx): " OPENAI_KEY
    echo
    if [ -z "$OPENAI_KEY" ]; then
        echo "OpenAI API Key cannot be empty. Please try again."
    fi
done

# Prompt for PERPLEXITY_API_KEY
PERPLEXITY_KEY=""
while [ -z "$PERPLEXITY_KEY" ]; do
    read -s -p "Enter your Perplexity API Key (e.g., pxk-xxxxxxxxxxxxxxxxx): " PERPLEXITY_KEY
    echo
    if [ -z "$PERPLEXITY_KEY" ]; then
        echo "Perplexity API Key cannot be empty. Please try again."
    fi
done

# You can add more prompts for other variables here if needed
# Example:
# read -p "Enter optional setting (default: value): " OPTIONAL_SETTING
# OPTIONAL_SETTING="${OPTIONAL_SETTING:-defaultValue}"

# Construct .env content
ENV_CONTENT="OPENAI_API_KEY=$OPENAI_KEY
PERPLEXITY_API_KEY=$PERPLEXITY_KEY
" # Add other collected variables here

# Create .env file
echo "Creating .env file in $CORE_DIR..."
echo "$ENV_CONTENT" > "$CORE_DIR/.env"
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create .env file. Check permissions for $CORE_DIR. Exiting."
    exit 1
fi
echo ".env file created successfully. This file is ignored by Git."

# Step 6: Start Bot with PM2 and Configure Autostart
echo -e "\nStep 6/6: Starting bot with PM2 and configuring autostart..."
pm2 start "$ECOSYSTEM_CONFIG_FILE"
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to start bot with PM2. Please check your '$ECOSYSTEM_CONFIG_FILE' file and PM2 status."
    exit 1
fi
echo "${PM2_APP_NAME} started successfully with PM2."

echo "Setting up PM2 to automatically start bot on system reboot. This might require 'sudo'."
pm2 save # Save the current process list
if [ $? -ne 0 ]; then
    echo "WARNING: Failed to save PM2 process list. You might need to manually run 'pm2 save'."
fi

# PM2 startup command is OS-specific and requires sudo, so we instruct the user.
echo -e "\n--- IMPORTANT FINAL STEP: PM2 Startup Configuration ---"
echo "To ensure your bot starts automatically after a system reboot, you must run the PM2 startup command."
echo "PM2 will generate a command for you. Please copy and paste it into your terminal and run it:"
echo "--------------------------------------------------"
pm2 startup # This command generates the OS-specific startup command
echo "--------------------------------------------------"
echo "After running the above 'sudo' command, your bot will automatically start on reboot."


echo -e "\n--------------------------------------------------"
echo "WhatsApp AI Filter Bot Setup Complete!"
echo "You can check the bot's status with: 'pm2 status'"
echo "View logs with: 'pm2 logs $PM2_APP_NAME'"
echo "To update the bot later, run: '$CORE_DIR/update.sh'"
echo "--------------------------------------------------"