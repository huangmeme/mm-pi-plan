# enter_plan_mode

Name:
enter_plan_mode

Description:
Use this tool to request user approval to enter Plan Mode before code changes begin.
Plan Mode is intended for tasks that need investigation, design, and implementation planning first.

Behavior:
- This tool asks the user to approve entering Plan Mode.
- If the user approves, the session switches into Plan Mode.
- A new active plan file is created for the current planning session.
- After entering Plan Mode, planning work should be written into that active plan file.
- After entering Plan Mode, do not keep the real plan only in chat.

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
- After this tool succeeds, update the active plan file before finishing the response.
