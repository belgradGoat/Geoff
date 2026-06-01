"""Registry of built-in and custom chain definitions."""

from .chain_config import ChainDefinition, StageDefinition


# Built-in Research Chain
RESEARCH_CHAIN = ChainDefinition(
    chain_type="research",
    name="Research Chain",
    stages=[
        StageDefinition(
            name="deep_research",
            stage_type="research",
            description="Comprehensive research on the topic",
        ),
        StageDefinition(
            name="gap_analysis",
            stage_type="gap_analysis",
            description="Review research for completeness and identify gaps",
        ),
        StageDefinition(
            name="refinement",
            stage_type="refinement",
            description="Improve document by addressing identified gaps",
        ),
        StageDefinition(
            name="polish",
            stage_type="polish",
            description="Final polish: formatting, cross-references, citations",
        ),
    ],
)

# Built-in Development Chain
DEVELOPMENT_CHAIN = ChainDefinition(
    chain_type="development",
    name="Development Chain",
    stages=[
        StageDefinition(
            name="planning",
            stage_type="planning",
            description="Create detailed implementation plan",
        ),
        StageDefinition(
            name="implementation",
            stage_type="working",
            description="Implement changes described in the plan",
        ),
        StageDefinition(
            name="qc_review",
            stage_type="qc",
            description="Review implementation for correctness and quality",
            is_qc_gate=True,
            retry_target_stage="implementation",
            max_qc_iterations=3,
        ),
        StageDefinition(
            name="documentation",
            stage_type="docs",
            description="Update documentation to reflect changes",
        ),
    ],
)

# Built-in OSINT Chain
OSINT_CHAIN = ChainDefinition(
    chain_type="osint",
    name="OSINT Chain",
    stages=[
        StageDefinition(
            name="reconnaissance",
            stage_type="reconnaissance",
            description="Gather intelligence from Telegram, Discord, X/Twitter, and web sources",
        ),
        StageDefinition(
            name="cross_reference",
            stage_type="cross_reference",
            description="Cross-reference findings across sources, verify claims, identify contradictions",
        ),
        StageDefinition(
            name="analysis",
            stage_type="osint_analysis",
            description="Analyze patterns, assess significance, identify emerging threats or developments",
        ),
        StageDefinition(
            name="synthesis",
            stage_type="osint_synthesis",
            description="Compile final intelligence brief with sourced findings and confidence levels",
            is_output_stage=True,
        ),
        StageDefinition(
            name="memory_update",
            stage_type="memory_update",
            description="Update persistent memory with new intelligence from this chain run",
            is_background=True,
        ),
    ],
)

# Registry of built-in chains
_BUILTIN_CHAINS: dict[str, ChainDefinition] = {
    "research": RESEARCH_CHAIN,
    "development": DEVELOPMENT_CHAIN,
    "osint": OSINT_CHAIN,
}


def get_chain(chain_type: str) -> ChainDefinition:
    """Get a chain definition by type.

    Args:
        chain_type: The chain type key ('research' or 'development')

    Returns:
        The chain definition

    Raises:
        KeyError: If chain type not found
    """
    if chain_type not in _BUILTIN_CHAINS:
        raise KeyError(f"Unknown chain type: {chain_type}. Available: {list(_BUILTIN_CHAINS.keys())}")
    return _BUILTIN_CHAINS[chain_type]


def list_chain_types() -> list[dict]:
    """List all available chain types with their metadata."""
    return [
        {
            "chain_type": chain.chain_type,
            "name": chain.name,
            "stages": [
                {"name": s.name, "stage_type": s.stage_type, "description": s.description}
                for s in chain.stages
            ],
            "total_stages": len(chain.stages),
        }
        for chain in _BUILTIN_CHAINS.values()
    ]
