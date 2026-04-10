# Mem0 Persistent Memory Rules

These rules are MANDATORY for all AI interactions to ensure long-term context retention and architectural consistency across sessions.

## 1. Tool Selection & Usage Rules

| Tool | Usage Rule |
| :--- | :--- |
| `mcp_mem0_search_memories` | **Primary Entry Point.** Use this first to find context. |
| `mcp_mem0_add_memory` | Use for **new** insights, decisions, or session summaries. |
| `mcp_mem0_get_memories` | Use for **discovery**. Use when search returns no hits or to browse history. |
| `mcp_mem0_get_memory` | Use for **verification**. Retrieve specific memory details by ID before updating. |
| `mcp_mem0_update_memory` | Use for **corrections**. If a stored fact is found to be incorrect, update it. |
| `mcp_mem0_list_entities` | Use to **audit context**. Verify which users or agents have stored memories. |
| `mcp_mem0_delete_memory` | Use for **pruning**. Remove obsolete or redundant information. |
| `mcp_mem0_delete_all_memories` | Use for **resets**. Clear all memories within a specific scope if requested. |
| `mcp_mem0_delete_entities` | Use for **cleanup**. Permanently remove a user/agent identity and all its memories. |

## 2. Advanced Filtering & Retrieval
- **Directive**: Use the `filters` parameter in `search_memories` or `get_memories` to scope results.
  - Example: `{"AND": [{"user_id": "current_user"}, {"metadata.type": "decision"}]}`
- **Directive**: When collaborating with other agents, use `list_entities` to identify `agent_id` scopes that may contain relevant shared knowledge.

## 3. Mandatory Lifecycle Rules

### Phase A: Task Initialization
- **Rule**: You MUST call `search_memories` with queries related to the current task (e.g., project name, specific entity, or bug ID) within the first 2 turns.
- **Rule**: If `search_memories` is empty, you MUST call `list_entities` to see if context exists under a different identifier.

### Phase B: Implementation & Decision Making
- **Rule**: Every architectural decision or "gotcha" discovered MUST be logged via `add_memory` with appropriate metadata.
- **Metadata Standard**:
  - `{"type": "decision"}`: Rationale for a change.
  - `{"type": "task_learning"}`: Solutions that worked.
  - `{"type": "anti_pattern"}`: Approaches that failed/crashed.
  - `{"type": "convention"}`: Coding style or repo-specific rules.

### Phase C: Context Handoff (Session End)
- **Rule**: Before completing a significant request, you MUST store a "bridge" memory.
- **Payload**: Include: 
  - `Goals achieved`
  - `Files modified`
  - `Open questions/blockers`
  - `Next steps`
- **Metadata**: `{"type": "session_state"}`.

## 4. Privacy & Data Integrity Rules
- **Rule**: NEVER store `API Keys`, `Passwords`, or `Strictly Confidential PII` in Mem0.
- **Rule**: If an incorrect fact is stored, you MUST use `update_memory` rather than deleting and re-adding, to preserve the memory's chronological link.
- **Rule**: Use `get_event_status` if confirmation of long-running background indexing is required.

