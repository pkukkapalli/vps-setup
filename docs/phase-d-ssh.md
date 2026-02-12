# Phase D — SSH hardening

[← Guide index](guide.md)

## What it does

- Writes a drop-in under `/etc/ssh/sshd_config.d/99-vps-setup.conf`.
- **Match only:** Disables keyboard-interactive and sets `PermitRootLogin prohibit-password`.
- **Harden:** Key-only (no password), no root login, `MaxAuthTries 3`, no X11, and `AllowUsers` so only listed users can log in.

## ⚠️ Lock-out warning

If you enable “Harden” and your SSH key login is not working, you can be locked out. Always test key login and sudo in a **second terminal** before applying.

## How to do it manually

Edit or create a file in `/etc/ssh/sshd_config.d/` (e.g. `99-hardening.conf`):

```
KbdInteractiveAuthentication no
PasswordAuthentication no
PermitRootLogin no
MaxAuthTries 3
X11Forwarding no
AllowUsers myuser
```

Then: `sudo systemctl restart sshd` or `sudo systemctl restart ssh`.

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Locked out after hardening | Use provider’s recovery/console. Mount the disk and edit or remove the drop-in under `sshd_config.d/`, or set `PasswordAuthentication yes` and `PermitRootLogin yes` temporarily. |
| “Connection refused” after restart | Check `systemctl status sshd` or `systemctl status ssh`. Ensure port 22 is allowed in the firewall. |
| AllowUsers blocked me | From console, edit the drop-in to add your username to `AllowUsers` or remove the line, then restart SSH. |
