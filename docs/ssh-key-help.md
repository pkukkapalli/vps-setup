# SSH key — find or create and copy (by host OS)

You need your **SSH public key** (one long line) to paste into vps-setup Phase A. Use the section for the OS of the **computer you’re using to run the CLI** (or the machine where you’ll SSH from).

---

## Do you already have a key?

**Check for an existing key:**

- **macOS / Linux:** In a terminal, run:  
  `ls -la ~/.ssh/*.pub`  
  If you see a file like `id_ed25519.pub` or `id_rsa.pub`, you have a key.
- **Windows (PowerShell):**  
  `Get-ChildItem $env:USERPROFILE\.ssh\*.pub`  
- **Windows (WSL):** Same as Linux: `ls -la ~/.ssh/*.pub`

If you have no `.pub` file, [generate a new key](#generate-a-new-key) first.

---

## Copy your public key to paste

### macOS

**Option 1 — copy straight to clipboard (then paste in terminal):**
```bash
pbcopy < ~/.ssh/id_ed25519.pub
```
If you use RSA: `pbcopy < ~/.ssh/id_rsa.pub`

**Option 2 — show key and copy manually:**
```bash
cat ~/.ssh/id_ed25519.pub
```
Select the full line (starts with `ssh-ed25519` or `ssh-rsa`) and copy (Cmd+C). Paste into vps-setup when asked.

---

### Windows

**PowerShell (key in `%USERPROFILE%\.ssh`):**
```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
```
Then paste in your SSH/terminal window (right‑click or Ctrl+V).  
If you use RSA: replace `id_ed25519.pub` with `id_rsa.pub`.

**WSL or Git Bash:**  
Same as Linux: run `cat ~/.ssh/id_ed25519.pub`, select the line, copy, and paste.

**No clipboard command?**  
Open the file in Notepad:  
`notepad %USERPROFILE%\.ssh\id_ed25519.pub`  
Copy the entire line and paste into vps-setup.

---

### Linux

**If you have `xclip`:**
```bash
xclip -selection clipboard < ~/.ssh/id_ed25519.pub
```
Then paste in the terminal (often middle‑click or Ctrl+Shift+V).

**Otherwise show and copy manually:**
```bash
cat ~/.ssh/id_ed25519.pub
```
Copy the full line (starts with `ssh-ed25519` or `ssh-rsa`) and paste into vps-setup.

---

## Generate a new key

Run this on your **laptop** (the machine you’ll SSH from), not on the VPS:

```bash
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/id_ed25519 -N ""
```

- Use your email or a label for `-C`.
- `-N ""` means no passphrase (optional; you can set one for security).

Then use the “Copy your public key” section above for your OS to copy `~/.ssh/id_ed25519.pub` and paste it into vps-setup.

---

## Paste into vps-setup

When Phase A asks for your key, paste the **entire line** (one line, no line breaks). It should look like:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... your_email@example.com
```

[← Guide index](guide.md)
