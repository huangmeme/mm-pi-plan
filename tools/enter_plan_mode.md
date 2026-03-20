# enter_plan_mode

Name:
enter_plan_mode

Description:
Use this tool to request user approval to enter Plan Mode before code changes begin.
Plan Mode is intended for tasks that need investigation, design, and implementation planning first.

Behavior:
- This tool asks the user to approve entering Plan Mode.
- The enter UI uses the same ask-style prompt foundation as ask_user_question and exit_plan_mode.
- The enter UI is intentionally minimal: a short purpose summary and `Yes` / `No` options.
- If the user approves, the session switches into Plan Mode.
- A new active plan file is created for the current planning session.
- After entering Plan Mode, that active plan file becomes the source of truth for the planning work.
- If a task summary is available, it is seeded into the active plan file immediately.

Use this tool when:
- The task will require writing or changing code.
- The implementation needs research, design, or sequencing before editing files.
- You want to confirm direction with the user before implementation starts.

Do not use this tool when:
- The change is small and can be implemented directly without a planning phase.
- The task is pure research and will not produce an implementation plan.
- You are already in Plan Mode.

Requirements:
- Prefer this tool when the task has meaningful implementation risk or ambiguity.
- After entering Plan Mode, follow the Plan Mode rules from the system prompt and plan file workflow.
