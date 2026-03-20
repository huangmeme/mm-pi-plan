# exit_plan_mode

Name:
exit_plan_mode

Description:
Use this tool when you are in Plan Mode, the active plan file has been written, and you are ready for the user to review that plan and approve leaving Plan Mode.

Behavior:
- You should already have written the implementation plan to the active plan file specified in the system prompt.
- This tool does not accept the plan content as a parameter.
- The extension reads the plan directly from the active plan file.
- The user reviews that plan through the active plan file as the source of truth, then chooses one of the available exit options.
- The exit UI reuses the same ask-style compact action list and inline input used by ask_user_question.
- The extension mainly checks that the active plan file exists and that newer evidence has been synced into it.
- Use this tool instead of asking the user for approval in plain assistant text.

User options:
- Approve and exit plan mode
- Add feedback and continue

Use this tool when:
- You are currently in Plan Mode.
- The task is an implementation task that will lead to code changes.
- The plan file already exists and is ready enough for the user to review.

Do not use this tool when:
- The task is pure research or codebase understanding.
- Important requirements or implementation choices are still unresolved.
- New evidence or user answers have not been synced back into the plan file yet.
- You are not in Plan Mode.

Requirements:
- Use ask_user_question first if requirements, constraints, or implementation choices are still unresolved.
- Only use this tool after the active plan file exists and is current enough for user review.
- If the user adds feedback instead of approving exit, stay in Plan Mode and update the active plan file before trying to exit again.

Usage:
```json
{}
```

Examples:
- "Search for and understand vim mode in the codebase" -> do not use exit_plan_mode.
- "Help me implement yank mode for vim" -> write the plan to the plan file, then use exit_plan_mode.
