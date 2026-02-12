# VPS Setup — Guide & Troubleshooting

In-depth guidance and troubleshooting for each phase of the vps-setup CLI.

**Quick link (GitHub):** [docs/guide.md](https://github.com/pkukkapalli/vps-setup/blob/main/docs/guide.md)

---

## General tips

- **Run phases in order:** A → B → C → D → E, then F/G/H/M as needed. Don’t enable the firewall or change SSH until key-based login works (Phase A).
- **Keep a second session open** when changing SSH or firewall so you can still log in if something goes wrong.
- **Binary users:** If you installed via the install script or a release binary, you don’t have the repo on disk; use the GitHub link above to browse the docs.

---

**SSH key (Phase A):** Don’t have a key or not sure how to copy it on your laptop? → [ssh-key-help.md](ssh-key-help.md) (macOS, Windows, Linux).

## Phase guides

| Phase | Topic | Doc |
|-------|--------|-----|
| **A** | Prerequisites (user + SSH key) | [phase-a-prerequisites.md](phase-a-prerequisites.md) |
| **B** | Firewall (UFW) | [phase-b-firewall.md](phase-b-firewall.md) |
| **C** | Automatic security updates | [phase-c-updates.md](phase-c-updates.md) |
| **D** | SSH hardening | [phase-d-ssh.md](phase-d-ssh.md) |
| **E** | Sudo (remove root NOPASSWD) | [phase-e-sudo.md](phase-e-sudo.md) |
| **F** | Nginx + custom domain + TLS + load balancing | [phase-f-nginx.md](phase-f-nginx.md) |
| **G** | Fail2ban | [phase-g-fail2ban.md](phase-g-fail2ban.md) |
| **H** | UFW logging | [phase-h-ufw-logging.md](phase-h-ufw-logging.md) |
| **M** | Mosh (mobile shell) | [phase-m-mosh.md](phase-m-mosh.md) |

Each doc has: **What it does**, **How to do it manually**, and **Troubleshooting**.

---

## Getting more help

- **Repo:** [github.com/pkukkapalli/vps-setup](https://github.com/pkukkapalli/vps-setup)
- **Releases (binaries):** [Releases](https://github.com/pkukkapalli/vps-setup/releases)
- Open an issue if you hit a bug or want to suggest an improvement.
