# Phase M — Mosh

[← Guide index](guide.md)

## What it does

- Installs the `mosh` package (server).
- If UFW is active, allows UDP 60000:61000 (mosh’s default port range).

## How to do it manually

```bash
sudo apt install mosh   # or dnf/yum/pacman/zypper
sudo ufw allow 60000:61000/udp
sudo ufw reload
```

Connect from your laptop: `mosh user@server-ip`.

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Mosh connection hangs or fails | Ensure UDP 60000:61000 is allowed in the firewall. Some providers or networks block UDP; try from another network. |
| “mosh: command not found” on laptop | Install mosh on your local machine (e.g. `brew install mosh` on macOS, or your distro’s package). |
