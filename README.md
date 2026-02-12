# VPS Security Setup — Interactive CLI

Interactive CLI to set up a new VPS (firewall, automatic security updates, SSH hardening, optional Nginx/TLS and fail2ban). Plan reference: see docs or `knowledge/vps-security-replication-plan.md` if you have the full repo.

## Install (Linux)

No Node.js required.

### One-line install script

```bash
curl -fsSL https://raw.githubusercontent.com/pkukkapalli/vps-setup/main/install.sh | bash
```

This downloads the latest release binary for your architecture (amd64 or arm64) into the current directory as `vps-setup`. Run `./vps-setup`.

To install into `/usr/local/bin` so you can run `vps-setup` from anywhere:

```bash
curl -fsSL https://raw.githubusercontent.com/pkukkapalli/vps-setup/main/install.sh | bash -s -- --install
```

**Public script URL:**  
[https://raw.githubusercontent.com/pkukkapalli/vps-setup/main/install.sh](https://raw.githubusercontent.com/pkukkapalli/vps-setup/main/install.sh)

### Manual download

| Architecture | Download (latest release) |
|-------------|---------------------------|
| **Linux x86_64 (amd64)** | [vps-setup-linux-amd64](https://github.com/pkukkapalli/vps-setup/releases/latest/download/vps-setup-linux-amd64) |
| **Linux ARM64 (aarch64)** | [vps-setup-linux-arm64](https://github.com/pkukkapalli/vps-setup/releases/latest/download/vps-setup-linux-arm64) |

```bash
# Example: amd64
curl -fSL -o vps-setup https://github.com/pkukkapalli/vps-setup/releases/latest/download/vps-setup-linux-amd64
chmod +x vps-setup
./vps-setup
```

When the tool needs root it will prompt for your password (`sudo`).

## Requirements (if running from source)

- **Node.js 18+**
- **Supported distros:** Debian, Ubuntu (apt); Fedora, RHEL, CentOS, Rocky, Alma (dnf/yum); Arch (pacman); OpenSUSE (zypper)
- You may run as any user; the tool will prompt for your password when `sudo` is required

## Copy to your VPS (source)

From your laptop (replace `user` and `your-vps-ip`):

```bash
scp -r vps-setup user@your-vps-ip:~/
```

Or copy this directory to the server (e.g. `/root/vps-setup`).

## Run

```bash
cd vps-setup
npm install
node run.mjs
# or: node run.mjs run
```

When the tool needs root (e.g. installing packages, writing to `/etc`), it will run `sudo` and ask for your password. You can also run as root or `sudo node run.mjs` if you prefer.

Run all phases with prompts:

```bash
node run.mjs run --all
```

Uses **commander**, **@inquirer/prompts**, **chalk**, **ora**. See [docs/node-cli-libraries.md](docs/node-cli-libraries.md).

## Menu

| Option | Phase |
|--------|--------|
| A | Prerequisites — create sudo user (key-only, no password), add SSH key |
| B | Firewall (UFW) — allow 22/80/443, deny 3000/8080, enable |
| C | Automatic security updates (apt/dnf; skipped on unsupported distros) |
| D | SSH hardening — drop-in config (match or harden with key-only, AllowUsers) |
| E | Sudo — comment out root NOPASSWD in cloud-init |
| F | Nginx + Certbot (optional) |
| G | Fail2ban (optional) |
| H | UFW logging medium |
| 1 | Run all (A–E then prompt F/G/H) |
| q | Quit |

Run in order: A → B → C → D → E, then F/G/H if you want. Ensure key-based login works (Phase A) before enabling UFW or changing SSH (B, D).

## After SSH hardening

If you use “Harden” (option 2) in Phase D, you log in as the user you set in AllowUsers with your SSH key, e.g.:

```bash
ssh deploy@your-vps-ip
```

Use `sudo` when you need root; do not use `ssh root@...`.
