# Phase G — Fail2ban

[← Guide index](guide.md)

## What it does

- Installs fail2ban and enables the service.
- The default sshd jail is usually enabled automatically.

## How to do it manually

```bash
sudo apt install fail2ban   # or dnf/yum/pacman/zypper
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Check if sshd jail is active | `sudo fail2ban-client status sshd`. |
| Banned my own IP | From another IP or console: `sudo fail2ban-client set sshd unbanip <your-ip>`. |
| Change bantime / findtime | Configure in `/etc/fail2ban/jail.local` or the jail’s config, then restart fail2ban. |
