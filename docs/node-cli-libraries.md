# Node.js libraries for a beautiful interactive CLI

Reference for building an interactive CLI in Node.js (used by the `run` script in this repo).

## Core stack

| Library | Purpose | Use in vps-setup |
|--------|---------|-------------------|
| **commander** | Parse argv, define commands/subcommands, `--help`, `--all` | Program structure, `vps-setup run`, `vps-setup run --all` |
| **@inquirer/prompts** | Interactive prompts (select, confirm, input) | Main menu, yes/no/skip, username, domains, etc. |
| **chalk** | Terminal colors and styles | `chalk.cyan('[*]')`, `chalk.green('OK')`, `chalk.yellow('!')` |
| **ora** | Spinners for async steps | "Installing UFW…", "Configuring…" then succeed/fail |

## Why these

- **@inquirer/prompts** — Modern Inquirer; list/select, confirm, input, checkbox. Arrow keys + Enter, clear prompts. Prefer over legacy `inquirer` for new code.
- **commander** — Standard for CLI apps; subcommands, options, auto help. No interactivity by itself; combine with Inquirer for menus.
- **chalk** — De facto standard for colored terminal output; no dependencies, supports 256/truecolor.
- **ora** — Spinners and `.succeed()` / `.fail()` for long-running steps (apt, ufw). Better UX than silent runs.

## Optional extras

- **boxen** — Draw boxes around text (e.g. phase headers).
- **listr2** — Multiple concurrent tasks with spinners (if you run several phases in parallel).
- **figures** — Unicode symbols (✓, ✖, ⚠) if you want them without ora.

## Install

```bash
npm install commander @inquirer/prompts chalk ora
```

## Minimal usage

```js
import { Command } from 'commander';
import { select, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';

const program = new Command();
program.name('vps-setup').description('VPS security setup');

program.command('run').action(async () => {
  const choice = await select({
    message: 'Choose phase',
    choices: [
      { name: 'Prerequisites', value: 'a' },
      { name: 'Firewall (UFW)', value: 'b' },
      { name: 'Quit', value: 'q' },
    ],
  });
  if (choice === 'q') process.exit(0);

  const ok = await confirm({ message: 'Configure UFW?', default: true });
  if (!ok) return;

  const spinner = ora('Installing UFW...').start();
  try {
    // run apt install...
    spinner.succeed('UFW installed.');
  } catch (e) {
    spinner.fail('Failed.');
  }
});

program.parse();
```

## References

- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) — `@inquirer/prompts` (new) and `inquirer` (legacy)
- [Commander.js](https://github.com/tj/commander.js)
- [chalk](https://github.com/chalk/chalk)
- [ora](https://github.com/sindresorhus/ora)
