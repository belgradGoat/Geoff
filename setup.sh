#!/bin/bash

#
# Geoff Setup Script
#
# This script helps you set up Geoff on your machine.
# It's fully transparent - read through it before running if you want.
#
# What it does:
#   1. Checks that required tools are installed (Python, Node, Claude CLI)
#   2. Asks for your Supabase credentials
#   3. Creates .env files with your credentials
#   4. Installs Python dependencies for MCP server and orchestrator
#   5. Installs Node dependencies for web UI
#   6. Registers the MCP server with Claude Code
#
# What it does NOT do:
#   - Require sudo or admin permissions
#   - Send any data to external servers (except npm/pip registries)
#   - Modify system files outside this project
#   - Store credentials anywhere except local .env files
#
# You can run this script multiple times safely.
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                               ║${NC}"
echo -e "${BLUE}║                    ${NC}Geoff Setup Script${BLUE}                        ║${NC}"
echo -e "${BLUE}║                                                               ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Step 1: Check Prerequisites
# =============================================================================

echo -e "${YELLOW}[1/6]${NC} Checking prerequisites..."
echo ""

MISSING_DEPS=()

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
    echo -e "  ${GREEN}✓${NC} Python: $PYTHON_VERSION"
else
    echo -e "  ${RED}✗${NC} Python 3 not found"
    MISSING_DEPS+=("Python 3 (https://python.org)")
fi

# Check uv (Python package manager)
if command -v uv &> /dev/null; then
    UV_VERSION=$(uv --version 2>&1 | head -1)
    echo -e "  ${GREEN}✓${NC} uv: $UV_VERSION"
else
    echo -e "  ${RED}✗${NC} uv not found"
    MISSING_DEPS+=("uv (curl -LsSf https://astral.sh/uv/install.sh | sh)")
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "  ${GREEN}✓${NC} Node.js: $NODE_VERSION"
else
    echo -e "  ${RED}✗${NC} Node.js not found"
    MISSING_DEPS+=("Node.js 18+ (https://nodejs.org)")
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "  ${GREEN}✓${NC} npm: $NPM_VERSION"
else
    echo -e "  ${RED}✗${NC} npm not found"
    MISSING_DEPS+=("npm (comes with Node.js)")
fi

# Check Claude CLI
if command -v claude &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Claude CLI: installed"
    CLAUDE_PATH=$(which claude)
else
    echo -e "  ${YELLOW}!${NC} Claude CLI not found (optional - needed for Claude provider)"
    CLAUDE_PATH=""
fi

# Check Tailscale (optional)
if command -v tailscale &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Tailscale: installed"
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
    if [ -n "$TAILSCALE_IP" ]; then
        echo -e "      Tailscale IP: $TAILSCALE_IP"
    fi
else
    echo -e "  ${YELLOW}!${NC} Tailscale not found (optional - needed for remote access)"
    TAILSCALE_IP=""
fi

echo ""

# Exit if missing critical dependencies
if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo -e "${RED}Missing required dependencies:${NC}"
    for dep in "${MISSING_DEPS[@]}"; do
        echo "  - $dep"
    done
    echo ""
    echo "Please install these and run this script again."
    exit 1
fi

# =============================================================================
# Step 2: Collect Supabase Credentials
# =============================================================================

echo -e "${YELLOW}[2/6]${NC} Supabase Configuration"
echo ""
echo "You'll need credentials from your Supabase project."
echo "Go to: https://supabase.com/dashboard → Your Project → Settings → API"
echo ""

# Check if .env already exists
if [ -f ".env" ]; then
    echo -e "${YELLOW}Found existing .env file.${NC}"
    read -p "Overwrite with new credentials? (y/N): " OVERWRITE
    if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env file."
        source .env 2>/dev/null || true
        SKIP_ENV_CREATION=true
    fi
fi

if [ "$SKIP_ENV_CREATION" != "true" ]; then
    echo ""

    # Supabase URL
    read -p "Supabase URL (https://xxxxx.supabase.co): " SUPABASE_URL
    while [[ ! "$SUPABASE_URL" =~ ^https://.*\.supabase\.co$ ]]; do
        echo -e "${RED}Invalid URL format. Should be like: https://abcdef.supabase.co${NC}"
        read -p "Supabase URL: " SUPABASE_URL
    done

    # Supabase Anon Key
    echo ""
    echo "Find 'anon public' key in API settings:"
    read -p "Supabase Anon Key: " SUPABASE_ANON_KEY
    while [ -z "$SUPABASE_ANON_KEY" ]; do
        echo -e "${RED}Anon key is required${NC}"
        read -p "Supabase Anon Key: " SUPABASE_ANON_KEY
    done

    # Supabase Service Key
    echo ""
    echo "Find 'service_role secret' key in API settings:"
    read -p "Supabase Service Key: " SUPABASE_SERVICE_KEY
    while [ -z "$SUPABASE_SERVICE_KEY" ]; do
        echo -e "${RED}Service key is required${NC}"
        read -p "Supabase Service Key: " SUPABASE_SERVICE_KEY
    done

    # Generate a random API key for the orchestrator
    ORCHESTRATOR_API_KEY=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | head -c 32 | xxd -p)

    echo ""
fi

# =============================================================================
# Step 3: Create .env Files
# =============================================================================

echo -e "${YELLOW}[3/6]${NC} Creating configuration files..."
echo ""

if [ "$SKIP_ENV_CREATION" != "true" ]; then
    # Root .env
    cat > .env << EOF
# Geoff Configuration
# Generated by setup.sh on $(date)

# Supabase Configuration
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

# Orchestrator Configuration
ORCHESTRATOR_API_KEY=$ORCHESTRATOR_API_KEY
ORCHESTRATOR_HOST=0.0.0.0
ORCHESTRATOR_PORT=8080

# AI Provider Configuration
ORCHESTRATOR_DEFAULT_PROVIDER=claude
EOF

    # Add Tailscale IP if available
    if [ -n "$TAILSCALE_IP" ]; then
        echo "" >> .env
        echo "# Tailscale (auto-detected)" >> .env
        echo "TAILSCALE_IP=$TAILSCALE_IP" >> .env
    fi

    echo -e "  ${GREEN}✓${NC} Created .env"

    # Web .env
    cat > web/.env << EOF
# Geoff Web UI Configuration
# Generated by setup.sh on $(date)

VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
VITE_ORCHESTRATOR_URL=http://localhost:8080
VITE_ORCHESTRATOR_API_KEY=$ORCHESTRATOR_API_KEY
EOF

    echo -e "  ${GREEN}✓${NC} Created web/.env"
else
    # Load existing values for MCP registration
    source .env 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Using existing .env files"
fi

echo ""

# =============================================================================
# Step 4: Install Python Dependencies
# =============================================================================

echo -e "${YELLOW}[4/6]${NC} Installing Python dependencies..."
echo ""

# MCP Server
echo "  Installing MCP server..."
cd "$SCRIPT_DIR/mcp-server"
if [ ! -d ".venv" ]; then
    uv venv --quiet
fi
uv pip install -e . --quiet
echo -e "  ${GREEN}✓${NC} MCP server installed"

# Orchestrator
echo "  Installing orchestrator..."
cd "$SCRIPT_DIR/orchestrator"
if [ ! -d ".venv" ]; then
    uv venv --quiet
fi
uv pip install -e . --quiet
echo -e "  ${GREEN}✓${NC} Orchestrator installed"

cd "$SCRIPT_DIR"
echo ""

# =============================================================================
# Step 5: Install Node Dependencies
# =============================================================================

echo -e "${YELLOW}[5/6]${NC} Installing Node dependencies..."
echo ""

cd "$SCRIPT_DIR/web"
npm install --silent 2>/dev/null
echo -e "  ${GREEN}✓${NC} Web UI dependencies installed"

cd "$SCRIPT_DIR"
echo ""

# =============================================================================
# Step 6: Register MCP Server with Claude
# =============================================================================

echo -e "${YELLOW}[6/6]${NC} Registering MCP server with Claude Code..."
echo ""

if [ -n "$CLAUDE_PATH" ]; then
    MCP_PYTHON_PATH="$SCRIPT_DIR/mcp-server/.venv/bin/python"

    # Check if already registered
    if claude mcp list 2>/dev/null | grep -q "agent-task-planner"; then
        echo -e "  ${YELLOW}!${NC} MCP server already registered"
        read -p "  Re-register with current settings? (y/N): " REREGISTER
        if [[ "$REREGISTER" =~ ^[Yy]$ ]]; then
            claude mcp remove agent-task-planner 2>/dev/null || true
        else
            echo -e "  ${GREEN}✓${NC} Keeping existing MCP registration"
            SKIP_MCP=true
        fi
    fi

    if [ "$SKIP_MCP" != "true" ]; then
        # Register MCP server
        claude mcp add-json --scope user agent-task-planner "{
  \"type\": \"stdio\",
  \"command\": \"$MCP_PYTHON_PATH\",
  \"args\": [\"-m\", \"agent_task_planner.server\"],
  \"env\": {
    \"SUPABASE_URL\": \"$SUPABASE_URL\",
    \"SUPABASE_SERVICE_KEY\": \"$SUPABASE_SERVICE_KEY\"
  }
}"

        if [ $? -eq 0 ]; then
            echo -e "  ${GREEN}✓${NC} MCP server registered with Claude Code"
        else
            echo -e "  ${RED}✗${NC} Failed to register MCP server"
            echo "      You can register manually later. See README.md for instructions."
        fi
    fi
else
    echo -e "  ${YELLOW}!${NC} Claude CLI not found, skipping MCP registration"
    echo "      Install Claude Code and run this script again, or register manually."
fi

echo ""

# =============================================================================
# Done!
# =============================================================================

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}║                     Setup Complete!                           ║${NC}"
echo -e "${GREEN}║                                                               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "  1. Set up the database (one-time):"
echo "     - Go to your Supabase project → SQL Editor"
echo "     - Copy the contents of supabase/schema.sql"
echo "     - Paste and run it"
echo ""
echo "  2. Start Geoff:"
echo -e "     ${GREEN}./start.sh${NC}"
echo ""
echo "  3. Open in browser:"
echo "     http://localhost:4011"
echo ""

if [ -n "$TAILSCALE_IP" ]; then
    echo "  For remote access (from your phone):"
    echo "     http://$TAILSCALE_IP:4011"
    echo ""
fi

echo -e "${BLUE}Useful commands:${NC}"
echo "  ./start.sh        - Start all services"
echo "  ./stop.sh         - Stop all services"
echo "  ./setup.sh        - Re-run this setup"
echo ""

# Save orchestrator API key reminder
echo -e "${YELLOW}Important:${NC} Your orchestrator API key is:"
echo "  $ORCHESTRATOR_API_KEY"
echo ""
echo "This is saved in .env - you'll need it if connecting from other tools."
echo ""
