#!/bin/bash
# WhatsApp AI Filter - Quick Install Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/avikalpg/whatsapp-ai-filter.git"
REPO_DIR="whatsapp-ai-filter"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required commands exist
check_requirements() {
    log_info "Checking requirements..."
    
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install git first."
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    log_success "All requirements satisfied."
}

# Reattach STDIN to the terminal when running via pipe (e.g. wget ... | bash)
if [ ! -t 0 ]; then
    if [ -e /dev/tty ]; then
        exec < /dev/tty
    else
        log_error "Interactive install requires a TTY (e.g. run Docker with -it). Download install.sh and run it locally instead."
        exit 1
    fi
fi

# Start installation
log_info "Starting WhatsApp AI Filter installation..."
log_info "This will install the tool in the current directory."

# Check requirements
check_requirements

# Check if directory exists
if [ -d "$REPO_DIR" ]; then
    log_warning "Directory $REPO_DIR already exists."
    read -p "Do you want to remove it and continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Removing existing directory..."
        rm -rf "$REPO_DIR"
    else
        log_error "Installation cancelled."
        exit 1
    fi
fi

# Clone repository
log_info "Cloning WhatsApp AI Filter repository..."
if git clone "$REPO_URL" "$REPO_DIR"; then
    log_success "Repository cloned successfully."
else
    log_error "Failed to clone repository. Please check your internet connection and try again."
    exit 1
fi

# Change to project directory
cd "$REPO_DIR"
log_info "Changed to project directory: $(pwd)"

# Check if setup.sh exists
if [ ! -f "setup.sh" ]; then
    log_error "setup.sh not found in the repository. This might be a corrupted download."
    exit 1
fi

# Make setup script executable
log_info "Making setup script executable..."
chmod +x setup.sh

# Run setup script
log_info "Starting interactive setup..."
log_info "Please follow the prompts to configure your WhatsApp AI Filter."
echo

# Run the setup script
if ./setup.sh; then
    log_success "Setup completed successfully!"
    log_info "You can now start using WhatsApp AI Filter."
    log_info "Refer to the documentation for usage instructions."
else
    log_error "Setup failed. Please check the error messages above and try again."
    exit 1
fi
