# exit_plan_mode

Name:
exit_plan_mode

Description:
Use this tool when you are in Plan Mode, the active plan file has been written, and you are ready for the user to review that plan and approve leaving Plan Mode.

Behavior:
- You should already have written the implementation plan to the active plan file specified in the system prompt.
- This tool does not accept the plan content as a parameter.
- The extension reads the plan directly from the active plan file.
- The user reviews that plan and chooses one of the available exit options.

User options:
- Approve and exit plan mode
- Continue planning

Use this tool when:
- You are currently in Plan Mode.
- The task is an implementation task that will lead to code changes.
- The plan file contains a meaningful implementation plan that is ready for review.

Do not use this tool when:
- The task is pure research or codebase understanding.
- Important requirements or implementation choices are still unresolved.
- The plan file is empty, incomplete, or too weak to review.
- You are not in Plan Mode.

Requirements:
- Use ask_user_question first if requirements, constraints, or implementation choices are still unresolved.
- Only use this tool after the active plan file is ready for user review.

Usage:
```json
{}
```

Examples:
- "Search for and understand vim mode in the codebase" -> do not use exit_plan_mode.
- "Help me implement yank mode for vim" -> write the plan to the plan file, then use exit_plan_mode.
