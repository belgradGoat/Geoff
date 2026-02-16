"""Prompt assembly for chain stages."""

from .chain_config import StageDefinition, ChainExecutionConfig


# Stage-type-specific prompt templates
STAGE_TEMPLATES: dict[str, str] = {
    "research": (
        "You are a research specialist. Produce a comprehensive research document on the given topic.\n"
        "Cover all major aspects, include relevant data points, cite sources where possible.\n"
        "Structure your output with clear sections and headings.\n"
        "Be thorough and detailed — this document will be reviewed and refined in subsequent stages."
    ),
    "gap_analysis": (
        "You are a critical reviewer. Review the research document provided below for completeness.\n"
        "Identify gaps, missing perspectives, weak arguments, or areas that need more depth.\n"
        "For each gap found, explain what is missing and why it matters.\n"
        "Structure your output as a numbered list of gaps with clear descriptions and suggestions."
    ),
    "refinement": (
        "You are a document refinement specialist. Improve the research document by addressing "
        "the identified gaps and weaknesses.\n"
        "Incorporate the gap analysis feedback to strengthen weak areas, add missing content, "
        "and improve the overall quality.\n"
        "Output the complete improved document, not just the changes."
    ),
    "polish": (
        "You are an editor performing a final polish pass. Fix formatting, improve readability, "
        "ensure cross-references are correct, and verify citations.\n"
        "Ensure consistent style, tone, and structure throughout.\n"
        "Output the final polished document ready for delivery."
    ),
    "planning": (
        "You are a technical architect. Create a detailed implementation plan for the given task.\n"
        "Include:\n"
        "- Analysis of the current codebase (read relevant files first)\n"
        "- Step-by-step implementation plan with specific files to modify\n"
        "- Key design decisions and their rationale\n"
        "- Potential risks and mitigations\n"
        "- Testing strategy"
    ),
    "working": (
        "You are a software engineer. Implement the changes described in the plan.\n"
        "Follow the plan precisely. Write clean, well-structured code.\n"
        "Make all necessary file changes. Run any relevant tests.\n"
        "Report what you implemented and any deviations from the plan."
    ),
    "qc": (
        "You are a QC reviewer. Review the implementation for correctness and quality.\n"
        "Check:\n"
        "- Does the implementation match the plan?\n"
        "- Are there any bugs or logic errors?\n"
        "- Is the code clean and well-structured?\n"
        "- Do tests pass?\n\n"
        "You MUST respond with a JSON block in this exact format:\n"
        '```json\n{"passed": true/false, "issues": ["issue 1", "issue 2"], '
        '"rework_instructions": "detailed instructions if failed"}\n```\n'
        "If all checks pass, set passed=true and leave issues/rework_instructions empty."
    ),
    "docs": (
        "You are a technical writer. Update documentation to reflect the changes made.\n"
        "Review what was implemented and ensure all relevant documentation is updated:\n"
        "- README files\n"
        "- API documentation\n"
        "- Code comments where helpful\n"
        "- Changelog entries if applicable"
    ),
}


class PromptBuilder:
    """Assembles prompts for chain stages."""

    @staticmethod
    def build_prompt(
        stage: StageDefinition,
        task_title: str,
        task_description: str,
        task_context: dict,
        accumulated_context: dict,
        config: ChainExecutionConfig,
    ) -> str:
        """Build the full prompt for a stage.

        Assembly order:
        1. system_prompt_prefix (user's domain customization)
        2. Base stage template
        3. domain_context (project/domain description)
        4. Task title + description + context
        5. Accumulated context from prior stages
        6. Output format instructions
        """
        parts = []

        # 1. System prompt prefix
        if config.system_prompt_prefix:
            parts.append(config.system_prompt_prefix)

        # 2. Base stage template
        stage_template = STAGE_TEMPLATES.get(stage.stage_type, "")
        # Check for stage overrides
        if stage.name in config.stage_overrides:
            override = config.stage_overrides[stage.name]
            if "template" in override:
                stage_template = override["template"]
        if stage_template:
            parts.append(f"## Instructions\n\n{stage_template}")

        # 3. Domain context
        if config.domain_context:
            parts.append(f"## Domain Context\n\n{config.domain_context}")

        # 4. Task info
        task_section = f"## Task\n\n**Title:** {task_title}"
        if task_description:
            task_section += f"\n\n**Description:** {task_description}"
        if task_context:
            # Include relevant task context (e.g., GitHub info)
            context_items = []
            for key, value in task_context.items():
                if key != "chain":  # Skip chain metadata
                    context_items.append(f"- {key}: {value}")
            if context_items:
                task_section += "\n\n**Additional Context:**\n" + "\n".join(context_items)
        parts.append(task_section)

        # 5. Accumulated context from prior stages
        if accumulated_context:
            context_section = "## Previous Stage Results\n"
            for stage_name, result in accumulated_context.items():
                context_section += f"\n### {stage_name}\n\n{result}\n"
            parts.append(context_section)

        # 6. QC-specific: include rework instructions if this is a retry
        if stage.stage_type == "working" and accumulated_context.get("qc_feedback"):
            parts.append(
                f"## QC Feedback (Address These Issues)\n\n{accumulated_context['qc_feedback']}"
            )

        return "\n\n".join(parts)
