#!/bin/bash

#
# Geoff Stop Script
#
# Stops the orchestrator and web UI services.
#

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "Stopping Geoff..."
echo ""

# Stop orchestrator
if [ -f ".orchestrator.pid" ]; then
    PID=$(cat .orchestrator.pid)
    if kill -0 $PID 2>/dev/null; then
        echo -n "Stopping orchestrator (PID: $PID)... "
        kill $PID 2>/dev/null
        sleep 1
        # Force kill if still running
        if kill -0 $PID 2>/dev/null; then
            kill -9 $PID 2>/dev/null
        fi
        echo -e "${GREEN}done${NC}"
    else
        echo -e "${YELLOW}Orchestrator not running${NC}"
    fi
    rm -f .orchestrator.pid
else
    echo -e "${YELLOW}No orchestrator PID file found${NC}"
fi

# Stop web UI
if [ -f ".web.pid" ]; then
    PID=$(cat .web.pid)
    if kill -0 $PID 2>/dev/null; then
        echo -n "Stopping web UI (PID: $PID)... "
        kill $PID 2>/dev/null
        sleep 1
        # Force kill if still running
        if kill -0 $PID 2>/dev/null; then
            kill -9 $PID 2>/dev/null
        fi
        echo -e "${GREEN}done${NC}"
    else
        echo -e "${YELLOW}Web UI not running${NC}"
    fi
    rm -f .web.pid
else
    echo -e "${YELLOW}No web UI PID file found${NC}"
fi

# Also kill any orphaned processes on our ports
echo ""
echo "Checking for orphaned processes..."

# Check port 8080 (orchestrator)
ORCH_ORPHAN=$(lsof -ti:8080 2>/dev/null || true)
if [ -n "$ORCH_ORPHAN" ]; then
    echo -n "Found process on port 8080 (PID: $ORCH_ORPHAN), stopping... "
    kill $ORCH_ORPHAN 2>/dev/null || true
    echo -e "${GREEN}done${NC}"
fi

# Check port 4011 (web UI)
WEB_ORPHAN=$(lsof -ti:4011 2>/dev/null || true)
if [ -n "$WEB_ORPHAN" ]; then
    echo -n "Found process on port 4011 (PID: $WEB_ORPHAN), stopping... "
    kill $WEB_ORPHAN 2>/dev/null || true
    echo -e "${GREEN}done${NC}"
fi

echo ""
echo -e "${GREEN}Geoff stopped.${NC}"
echo ""
