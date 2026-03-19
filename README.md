# mm-pi-plan

`mm-pi-plan` is a Pi package that adds an approval-gated session-level plan mode.

The extension is designed for tasks that should be researched and planned before code changes begin.

## Workflow

`normal -> EnterPlanMode (approved) -> planning -> ExitPlanMode (approved) -> normal`

While planning:

- the agent can inspect the codebase
- the agent can use search, read, LSP, and web tools when available
- the agent may only write to the generated plan file
- the agent cannot use `bash`
- the generated plan file is created under the user's home directory in `.pi/plans/` with a fun random name like `mint-panda-a8f3.md`

## Tools

- `enter_plan_mode`
- `exit_plan_mode`
- `ask_user_question`

`ask_user_question` is available in both normal mode and plan mode. Use it whenever the model needs user input to resolve ambiguity or confirm a meaningful decision.

Each tool loads its long-form behavior contract from Markdown so you can edit it later:

- `tools/enter_plan_mode.md`
- `tools/exit_plan_mode.md`
- `tools/ask_user_question.md`
- `tools/PlanMode.md`

After editing those files, run `/reload` in Pi.

## Install

From git:

```bash
pi install git:github.com/your-org/mm-pi-plan
```

For local development:

```bash
pi -e ./src/index.ts
```

## Commands

- `/plan`
- `/plan on`
- `/plan off`
- `/plan status`
- `/plan <task>`

## Development

```bash
npm install
npm run check
```
