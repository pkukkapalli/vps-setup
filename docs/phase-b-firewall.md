# Phase B — Firewall (UFW)

[← Guide index](guide.md)

## What it does

- Installs UFW, sets default policies (deny incoming, allow outgoing, deny forward).
- Allows TCP 22 (SSH), 80 (HTTP), 443 (HTTPS); denies 3000 and 8080 by default.
- Optionally enables IPv6 and lets you add extra ports to deny.
- Asks before enabling UFW.

## How to do it manually

```bash
sudo apt install ufw   # or dnf/yum/pacman/zypper
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000
sudo ufw deny 8080
sudo ufw enable
```

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Locked out after enabling UFW | From provider’s console (Hetzner, AWS, etc.), use “Console” or “Recovery” to log in and run `sudo ufw allow 22/tcp` and `sudo ufw reload`, or disable UFW temporarily. |
| UFW not available on my distro | Some minimal or non-Debian systems use firewalld or iptables. Install UFW if your distro has it, or configure the firewall your distro uses. |
| Need to allow another port | `sudo ufw allow <port>/tcp` (or `/udp`), then `sudo ufw reload`. |
