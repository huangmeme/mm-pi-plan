# ask_user_question

Name:
ask_user_question

Description:
Use this tool whenever an important requirement, product decision, or implementation tradeoff is still unresolved and user input is needed before work can continue confidently.
This is a general-purpose clarification tool and is not limited to Plan Mode.

Behavior:
- This tool asks the user one focused question.
- You may provide answer options when they help narrow the decision.
- The answer should be used to remove ambiguity, confirm direction, or unblock the next decision.
- In Plan Mode, it is especially useful before calling exit_plan_mode.

Important rule:
- Ask only one atomic question per tool call.
- If there are multiple unresolved decisions, ask them in separate tool calls.
- Do not bundle several sub-questions into one long prompt.

Use this tool when:
- A requirement is ambiguous.
- Multiple implementation directions are viable and user preference matters.
- The current task depends on business logic, UX details, workflow choices, or constraints you cannot infer safely.

Do not use this tool when:
- The answer can be discovered by inspecting the repository or available evidence.
- The question is low impact and would not materially change the next step or final result.
- You are asking filler questions instead of resolving real planning blockers.
- You are trying to ask multiple independent questions at once.

Requirements:
- Keep questions focused and decision-relevant.
- Prefer concise questions that unblock planning quickly.
- In Plan Mode, use this tool before exit_plan_mode when unresolved questions would weaken the plan.
- Keep `question` short and put extra detail into `context` only when needed.
- Keep `options` short and mutually distinct.

Usage:
```json
{
  "question": "string",
  "context": "optional string",
  "options": ["optional", "string", "array"]
}
```

Examples:
- Closed choice example:
```json
{
  "question": "Should this feature be enabled by default?",
  "context": "I am adding a new setting, but the repository does not define the expected default.",
  "options": ["Enabled", "Disabled"]
}
```
- Open question example:
```json
{
  "question": "Where should this entry point live in the UI?"
}
```
- Multiple decisions should be split:
```json
{
  "question": "Should this feature be enabled by default?",
  "options": ["Enabled", "Disabled"]
}
```

Then ask a second question separately if needed:

```json
{
  "question": "Where should this entry point live in the UI?",
  "options": ["Top navigation", "Settings page"]
}
```
