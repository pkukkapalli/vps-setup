# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.3.0] - 2025-02-12

### Added

- **Phase A (Prerequisites):** Sudo choice for the new user — NOPASSWD (no password for sudo) or set a password interactively. Agent flag `--sudo-nopasswd` to apply NOPASSWD non-interactively.
- Scary warning when the user has not verified SSH key login: clear lockout risk and “open a new terminal, ssh in, run sudo -v” before running firewall or SSH hardening.
- SSH key copy-paste instructions expanded per OS (macOS, Windows, Linux) with “key file missing? generate: ssh-keygen …” and a follow-up message when no key is entered.
- CHANGELOG.md (Keep a Changelog format).

### Changed

- Phase A now writes `/etc/sudoers.d/99-vps-setup-<user>` when NOPASSWD is chosen; validates with `visudo -c -f` before keeping.

---

## [1.2.2] - 2025-02-12

### Added

- Guide (web) URL in main `--help` so every CLI link is a clear web link.
- Plain URL (no underline) for “?) Guide & troubleshooting” so terminals can linkify it.

## [1.2.1] - 2025-02-12

### Changed

- User home for SSH dir comes from `getent passwd` so system users (e.g. home `/opt/deploy`) work.
- SSH key add is idempotent: if the key is already in `authorized_keys`, we skip appending and say “Key already present.”
- `/etc/default/ufw` is read via root when needed so it works when the file is not world-readable.

## [1.2.0] - 2025-02-12

### Added

- **Agent-friendly CLI:** `vps-setup phase <name> [options]` to run a single phase with flags (no prompts when options are provided). Phases: `prerequisites`, `firewall`, `updates`, `ssh`, `sudo`, `nginx`, `fail2ban`, `ufw-logging`, `mosh`.
- Per-phase `--help` with an “Agent” line and example command so automation can see exactly what to pass.
- **Skip when already satisfied:** Each phase checks if its work is already applied (e.g. UFW active, SSH drop-in exists) and skips unless `--force` is passed.
- Main `--help` documents agent use, phase list, and examples.

### Changed

- Phase A (prerequisites) accepts `--user` and `--ssh-key` for non-interactive use.
- Phase B (firewall) accepts `--allow`, `--deny`, `--enable`.
- Phases C–M accept their respective flags for agent mode.

## [1.1.2] - 2025-02

### Added

- Guide split into per-phase docs (`docs/phase-a-prerequisites.md` through `phase-m-mosh.md`) with `docs/guide.md` as index.
- CLI shows guide URL at startup and under “?) Guide & troubleshooting”.
- SSH key help doc and redirect from Phase A when no key is pasted.

## [1.1.1] - 2025-02

### Changed

- License: 1-Clause BSD NON-AI; `package.json` set to `SEE LICENSE IN LICENSE`.

## [1.1.0] - 2025-02

### Added

- One-line bash install script (`install.sh`) and README section.
- Review-driven fixes: bugs, security, performance, quality.

### Fixed

- Release workflow: disable `generate_release_notes`, add `contents: write`.

## [1.0.0] - 2025-02

### Added

- Initial release: interactive VPS security CLI (Node.js).
- Phases: Prerequisites (user + SSH key), Firewall (UFW), Automatic updates, SSH hardening, Sudo (cloud-init NOPASSWD), Nginx + TLS, Fail2ban, UFW logging, Mosh.
- Linux executable build (esbuild + pkg) and GitHub Release workflow on tag `v*` (amd64 and arm64).

[Unreleased]: https://github.com/pkukkapalli/vps-setup/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/pkukkapalli/vps-setup/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/pkukkapalli/vps-setup/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/pkukkapalli/vps-setup/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/pkukkapalli/vps-setup/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/pkukkapalli/vps-setup/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/pkukkapalli/vps-setup/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/pkukkapalli/vps-setup/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/pkukkapalli/vps-setup/releases/tag/v1.0.0
