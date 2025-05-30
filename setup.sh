#!/bin/bash

# --- Configuration ---
# This assumes setup.sh is in the project root directory
PROJECT_ROOT_DIR="$(dirname "$(readlink -f "$0")")"
CORE_DIR="$PROJECT_ROOT_DIR/core"
PM2_APP_NAME="whatsapp-ai-filter"
ECOSYSTEM_CONFIG_FILE="ecosystem.config.js"

# --- Helper function for asking and confirming commands ---
run_command_with_confirm() {
    local cmd="$1"
    local prompt="$2"

    echo -e "\n--- Action Required ---"
    echo "About to run: $cmd"
    read -p "$prompt (Y/n): " yn
    case $yn in
        [Nn]*)
            echo "Operation cancelled."
            return 1 # Return 1 for cancellation
            ;;
        [Yy]*)
            # Try running command directly
            eval "$cmd"
            local status=$?
            if [ $status -ne 0 ]; then
                echo "Command failed without sudo. Trying with sudo..."
                eval "sudo $cmd"
                status=$?
            fi
            return $status # Return the status of the command
            ;;
        *)
            # Default to yes if input is empty or unrecognized
            eval "$cmd"
            local status=$?
            if [ $status -ne 0 ]; then
                echo "Command failed without sudo. Trying with sudo..."
                eval "sudo $cmd"
                status=$?
            fi
            return $status # Return the status of the command
            ;;
    esac
}

echo "--- Starting WhatsApp AI Filter Bot Setup ---"
echo "This script will guide you through setting up the bot on a Unix-like system (Linux, macOS, WSL)."
echo "You will be asked for confirmation before critical or system-altering steps."
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

# Step 4: PM2 Installation Check and Install (if needed)
echo -e "\nStep 4/6: PM2 Installation Check and Automatic Install (if needed)"
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed globally."
    # The run_command_with_confirm handles the sudo prompt if npm needs it for global installs
    if ! run_command_with_confirm "npm install -g pm2" "Ready to install PM2 globally? (May require sudo password if npm cannot install globally without it)"; then
        echo "ERROR: Failed to install PM2 globally or operation cancelled. Please install it manually:"
        echo "       'npm install -g pm2' or 'sudo npm install -g pm2'"
        exit 1
    fi
    echo "PM2 installed successfully."
else
    echo "PM2 found."
fi

# Step 5: Collect Environment Variables and Create .env file
echo -e "\nStep 5/6: Configuring Environment Variables"
echo "Please provide at least one API key for the bot to function (Perplexity AI or OpenAI)."
echo "If you don't want to use a specific AI, just press Enter to leave its key empty."
echo "Your input will be hidden for security."

PERPLEXITY_KEY=""
OPENAI_KEY=""
ALL_KEYS_EMPTY=true

# Loop until at least one key is provided
while $ALL_KEYS_EMPTY; do
    echo "" # Newline for clarity in the loop

    # Prompt for PERPLEXITY_API_KEY (Recommended first)
    read -s -p "Enter your Perplexity AI Key (optional, e.g., pxk-xxxxxxxxxxxxxxxxx): " PERPLEXITY_KEY
    echo

    # Prompt for OPENAI_API_KEY
    read -s -p "Enter your OpenAI API Key (optional, e.g., sk-xxxxxxxxxxxxxxxxx): " OPENAI_KEY
    echo

    if [ -z "$PERPLEXITY_KEY" ] && [ -z "$OPENAI_KEY" ]; then
        echo "ERROR: You must provide at least one API key (Perplexity AI or OpenAI). Please try again."
        ALL_KEYS_EMPTY=true # Keep looping
    else
        ALL_KEYS_EMPTY=false # Exit loop
    fi
done

echo -e "\n--- Anonymous Usage Analytics ---"
echo "To help improve this tool, we collect anonymous usage data (e.g., messages processed, AI provider usage, bot uptime)."
echo "This data helps us understand how the bot is used and where to focus development efforts."
echo "No personal information or message content is ever collected."
echo "You can disable this at any time by editing the ANALYTICS_ENABLED variable in your $CORE_DIR/.env file."

# Prompt for user preference (defaulting to Y)
read -p "Enable anonymous usage analytics? (Y/n, default: Y): " -n 1 -r REPLY
echo # (optional) move to a new line

ANALYTICS_ENABLED_VALUE="true" # Default to true
if [[ "$REPLY" =~ ^[Nn]$ ]]; then
    ANALYTICS_ENABLED_VALUE="false"
    echo "Anonymous usage analytics DISABLED."
else
    echo "Anonymous usage analytics ENABLED."
fi

# You can add more prompts for other variables here if needed
# Example:
# read -p "Enter optional setting (default: value): " OPTIONAL_SETTING
# OPTIONAL_SETTING="${OPTIONAL_SETTING:-defaultValue}"

# Construct .env content with all variables
ENV_CONTENT="OPENAI_API_KEY=$OPENAI_KEY
PERPLEXITY_API_KEY=$PERPLEXITY_KEY
ANALYTICS_ENABLED=$ANALYTICS_ENABLED_VALUE
" # Add other collected variables here if needed

# Create .env file
echo "Creating .env file in $CORE_DIR..."
echo "$ENV_CONTENT" > "$CORE_DIR/.env"
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create .env file. Check permissions for $CORE_DIR. Exiting."
    exit 1
fi
echo ".env file created successfully. This file is ignored by Git."

# Step 6: Initial WhatsApp Authentication (QR Code Scan)
echo -e "\nStep 6/6: Initial WhatsApp Authentication (QR Code Scan)"

LOG_SUCCESS="WhatsApp Web client is ready!"

echo "Starting the bot directly to display the WhatsApp QR code..."
# Use a named pipe (FIFO) for communication
PIPE=$(mktemp -u)
mkfifo "$PIPE"

# Start the process, redirecting its output to the pipe
node dist/index.js > "$PIPE" 2>&1 &
NODE_PID=$!

# Read from the pipe in the main shell
while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *"$LOG_SUCCESS"* ]]; then
        echo "Authentication detected! Killing temporary bot process..."
        kill $NODE_PID
        break
    fi
done < "$PIPE"

# wait $NODE_PID 2>/dev/null
rm "$PIPE"
sleep 2
if kill -0 $NODE_PID 2>/dev/null; then
    echo "Process still running, force killing..."
    kill -9 $NODE_PID 2>/dev/null
fi

echo -e "\nStarting Bot with PM2 and Configuring Autostart"

if run_command_with_confirm "pm2 start \"$ECOSYSTEM_CONFIG_FILE\"" "Ready to start the bot with PM2?"; then
    echo "${PM2_APP_NAME} started successfully with PM2."

    echo "Saving PM2 process list for auto-restart on system reboot..."
    if ! run_command_with_confirm "pm2 save" "Ready to save PM2 process list?"; then
        echo "WARNING: Failed to save PM2 process list or operation cancelled. You might need to manually run 'pm2 save'."
    fi

    # PM2 startup command is OS-specific and requires sudo, so we get it and then ask to execute
    echo -e "\n--- IMPORTANT FINAL STEP: PM2 Startup Configuration ---"
    echo "To ensure your bot starts automatically after a system reboot, you must run the PM2 startup command."
    echo "PM2 will generate a command for you."

    STARTUP_CMD=$(pm2 startup) # Get the startup command from PM2
    echo "Generated startup command: $STARTUP_CMD"

    if run_command_with_confirm "$STARTUP_CMD" "Ready to execute the PM2 startup command? (This will likely require your 'sudo' password)"; then
        echo "PM2 startup command executed successfully. Your bot should auto-start on reboot."
    else
        echo "PM2 startup command not executed. Your bot will NOT auto-start on reboot without this."
        echo "If you wish to configure it later, run the following command manually (it requires 'sudo'):"
        echo "       '$STARTUP_CMD'"
    fi
else
    echo "Bot startup cancelled. You can start it manually later with: 'pm2 start $CORE_DIR/$ECOSYSTEM_CONFIG_FILE'"
    exit 1 # Exit if user cancels
fi

echo -e "\n--------------------------------------------------"
echo "WhatsApp AI Filter Bot Setup Complete!"
echo "You can check the bot's status with: 'pm2 status'"
echo "View logs with: 'pm2 logs $PM2_APP_NAME'"
echo "To update the bot later, run: '$CORE_DIR/update-deployment.sh'"
echo "--------------------------------------------------"