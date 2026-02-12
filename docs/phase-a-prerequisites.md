# Phase A — Prerequisites (user + SSH key)

[← Guide index](guide.md)

**Don’t have a key or not sure how to copy it?** See [ssh-key-help.md](ssh-key-help.md) for OS-specific steps (macOS, Windows, Linux).

## What it does

- Creates a new system user with sudo (or the distro’s admin group: `sudo` on Debian/Ubuntu, `wheel` elsewhere).
- Creates `~/.ssh` for that user and optionally appends your SSH public key to `~/.ssh/authorized_keys`.
- Does **not** set a password (key-only login intended).

## How to do it manually

**Create user (Debian/Ubuntu):**
```bash
sudo adduser --disabled-password --gecos "" myuser
sudo usermod -aG sudo myuser
```

**Create user (Fedora/RHEL/Arch):**
```bash
sudo useradd -m -s /bin/bash myuser
sudo passwd -l myuser
sudo usermod -aG wheel myuser
```

**Add SSH key:**
```bash
sudo mkdir -p /home/myuser/.ssh
sudo chmod 700 /home/myuser/.ssh
echo "paste-your-public-key-here" | sudo tee -a /home/myuser/.ssh/authorized_keys
sudo chown -R myuser:myuser /home/myuser/.ssh
sudo chmod 600 /home/myuser/.ssh/authorized_keys
```

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| “Permission denied (publickey)” when SSH’ing | Ensure the key was added to `authorized_keys` and that you’re using the right key: `ssh -v myuser@server`. On your laptop, `ssh-add -l` to see loaded keys. |
| “User does not exist” | Create the user with the commands above, then add the key. |
| No sudo after login | Confirm the user is in the sudo (or wheel) group: `groups myuser`. Add with `sudo usermod -aG sudo myuser` (or `wheel`). |
