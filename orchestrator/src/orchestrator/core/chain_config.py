"""Configuration dataclasses for chain orchestration."""

from dataclasses import dataclass, field


@dataclass
class StageDefinition:
    """Definition of a single stage in a chain."""

    name: str
    stage_type: str
    description: str
    is_qc_gate: bool = False
    retry_target_stage: str | None = None
    max_qc_iterations: int = 3


@dataclass
class ChainDefinition:
    """Definition of a complete chain workflow."""

    chain_type: str
    name: str
    stages: list[StageDefinition] = field(default_factory=list)


@dataclass
class ChainExecutionConfig:
    """Runtime configuration for a chain execution."""

    provider: str = "claude"
    working_dir: str | None = None
    domain_context: str = ""
    system_prompt_prefix: str = ""
    stage_overrides: dict = field(default_factory=dict)


@dataclass
class StageResult:
    """Result from executing a single stage."""

    success: bool
    output: str
    agent_id: str | None = None
    result_data: dict = field(default_factory=dict)
    error: str | None = None
