# Phase C — Automatic security updates

[← Guide index](guide.md)

## What it does

- **Debian/Ubuntu (apt):** Installs `unattended-upgrades`, configures `20auto-upgrades` so security updates run automatically (no auto-reboot).
- **Fedora/RHEL (dnf):** Enables `dnf-automatic-install.timer`.
- **RHEL/CentOS (yum):** Enables `yum-cron`.
- Other distros: Phase is skipped with a short message; you can configure updates manually.

## How to do it manually (Debian/Ubuntu)

```bash
sudo apt install unattended-upgrades apt-listchanges
echo 'APT::Periodic::Update-Package-Lists "1";' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades
echo 'APT::Periodic::Unattended-Upgrade "1";'   | sudo tee -a /etc/apt/apt.conf.d/20auto-upgrades
```

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Updates not running | Check: `grep -r Unattended-Upgrade /etc/apt/apt.conf.d/`. For dnf: `systemctl status dnf-automatic-install.timer`. For yum: `systemctl status yum-cron`. |
| Want to disable auto-updates | Remove or rename the config (e.g. `20auto-upgrades`) or disable the timer/service. |
