# Agent Orchestrator

FastAPI service for launching and managing Claude agents remotely.

## Installation

```bash
pip install -e .
```

## Running

```bash
python -m orchestrator.main
```

Or via uvicorn directly:

```bash
uvicorn orchestrator.main:app --host 0.0.0.0 --port 8080
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents` | Launch new agent |
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Get agent details |
| DELETE | `/api/agents/:id` | Stop agent |
| WS | `/api/agents/:id/stream` | Live output stream |

## Configuration

Set environment variables or use `.env` file:

- `ORCHESTRATOR_API_KEY` - Required API key for authentication
- `ORCHESTRATOR_HOST` - Host to bind (default: 0.0.0.0)
- `ORCHESTRATOR_PORT` - Port to listen on (default: 8080)
