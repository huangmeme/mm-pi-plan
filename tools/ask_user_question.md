# ask_user_question

Name:
ask_user_question

Description:
Use this tool whenever an important requirement, product decision, or implementation tradeoff is still unresolved and user input is needed before work can continue confidently.
This is a general-purpose clarification tool and is not limited to Plan Mode.

Behavior:
- This tool asks the user a focused question.
- You may provide answer options when they help narrow the decision.
- The answer should be used to remove ambiguity, confirm direction, or unblock the next decision.
- In Plan Mode, it is especially useful before calling exit_plan_mode.

Use this tool when:
- A requirement is ambiguous.
- Multiple implementation directions are viable and user preference matters.
- The current task depends on business logic, UX details, workflow choices, or constraints you cannot infer safely.

Do not use this tool when:
- The answer can be discovered by inspecting the repository or available evidence.
- The question is low impact and would not materially change the next step or final result.
- You are asking filler questions instead of resolving real planning blockers.

Requirements:
- Keep questions focused and decision-relevant.
- Prefer concise questions that unblock planning quickly.
- In Plan Mode, use this tool before exit_plan_mode when unresolved questions would weaken the plan.

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
  "question": "这个功能默认应该开启还是关闭？",
  "context": "我准备加一个新开关，但仓库里没有明确默认值约定。",
  "options": ["默认开启", "默认关闭"]
}
```
- Open question example:
```json
{
  "question": "这个入口你希望放在顶部导航还是设置页里？"
}
```
