#!/bin/bash

#
# Geoff Start Script
#
# Starts both the orchestrator and web UI.
# Services run in the background and logs are saved to ./logs/
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create logs directory
mkdir -p logs

echo ""
echo -e "${BLUE}Starting Geoff...${NC}"
echo ""

# Check if services are already running
if [ -f ".orchestrator.pid" ] && kill -0 $(cat .orchestrator.pid) 2>/dev/null; then
    echo -e "${YELLOW}Orchestrator already running (PID: $(cat .orchestrator.pid))${NC}"
    ORCH_RUNNING=true
fi

if [ -f ".web.pid" ] && kill -0 $(cat .web.pid) 2>/dev/null; then
    echo -e "${YELLOW}Web UI already running (PID: $(cat .web.pid))${NC}"
    WEB_RUNNING=true
fi

# Start orchestrator
if [ "$ORCH_RUNNING" != "true" ]; then
    echo -n "Starting orchestrator... "
    cd "$SCRIPT_DIR/orchestrator"
    source "$SCRIPT_DIR/env/bin/activate"

    # Load environment variables
    if [ -f "$SCRIPT_DIR/.env" ]; then
        export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
    fi

    # Check for TLS certs
    SSL_ARGS=""
    if [ -f "$SCRIPT_DIR/certs/cert.pem" ] && [ -f "$SCRIPT_DIR/certs/key.pem" ]; then
        SSL_ARGS="--ssl-certfile $SCRIPT_DIR/certs/cert.pem --ssl-keyfile $SCRIPT_DIR/certs/key.pem"
    fi

    nohup python -m uvicorn orchestrator.main:app \
        --host ${ORCHESTRATOR_HOST:-0.0.0.0} \
        --port ${ORCHESTRATOR_PORT:-8080} \
        $SSL_ARGS \
        > "$SCRIPT_DIR/logs/orchestrator.log" 2>&1 &

    echo $! > "$SCRIPT_DIR/.orchestrator.pid"
    echo -e "${GREEN}done${NC} (PID: $!)"
    cd "$SCRIPT_DIR"
fi

# Start web UI
if [ "$WEB_RUNNING" != "true" ]; then
    echo -n "Starting web UI... "
    cd "$SCRIPT_DIR/web"

    nohup npm run dev > "$SCRIPT_DIR/logs/web.log" 2>&1 &

    echo $! > "$SCRIPT_DIR/.web.pid"
    echo -e "${GREEN}done${NC} (PID: $!)"
    cd "$SCRIPT_DIR"
fi

# Wait a moment for services to start
sleep 2

echo ""
echo -e "${GREEN}Geoff is running!${NC}"
echo ""

# Get URLs
ORCHESTRATOR_PORT=${ORCHESTRATOR_PORT:-8080}
WEB_PORT=4011

# Detect protocol
if [ -f "certs/cert.pem" ] && [ -f "certs/key.pem" ]; then
    PROTO="https"
else
    PROTO="http"
fi

echo "  Web UI:       $PROTO://localhost:$WEB_PORT"
echo "  Orchestrator: $PROTO://localhost:$ORCHESTRATOR_PORT"

# Check for Tailscale
if [ -f ".env" ]; then
    source .env 2>/dev/null
    if [ -n "$TAILSCALE_IP" ]; then
        echo ""
        echo "  Remote access (via Tailscale):"
        echo "    $PROTO://$TAILSCALE_IP:$WEB_PORT"
    fi
fi

echo ""
echo -e "${BLUE}Logs:${NC}"
echo "  logs/orchestrator.log"
echo "  logs/web.log"
echo ""
echo "To stop: ${YELLOW}./stop.sh${NC}"
echo ""
