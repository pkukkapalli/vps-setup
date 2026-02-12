# Phase E — Sudo (remove root NOPASSWD)

[← Guide index](guide.md)

## What it does

- Looks for `/etc/sudoers.d/90-cloud-init-users` (common on cloud images).
- If it finds a root NOPASSWD line, offers to comment it out and backs up the file to `.bak`.

## How to do it manually

```bash
sudo visudo -f /etc/sudoers.d/90-cloud-init-users
# Comment out the line that contains root and NOPASSWD (add # at the start).
# Or: sudo cp /etc/sudoers.d/90-cloud-init-users /etc/sudoers.d/90-cloud-init-users.bak
# Then edit and comment the line.
```

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| “Cannot read” or permission error | The script reads the file via `sudo cat`. If you see errors, run the phase as root or with sudo. |
| Broke sudo | Restore from backup: `sudo cp /etc/sudoers.d/90-cloud-init-users.bak /etc/sudoers.d/90-cloud-init-users`. Use recovery console if you can’t sudo. |
