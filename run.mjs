#!/usr/bin/env node
/**
 * VPS Security Setup - Interactive CLI (Node.js)
 * Run as any user: sudo will be used when needed and will prompt for your password.
 * Supports: Debian, Ubuntu, Fedora, RHEL/CentOS, Arch, OpenSUSE (via apt, dnf/yum, pacman, zypper).
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';

const DOCS_BASE = 'https://github.com/pkukkapalli/vps-setup/blob/main/docs';
const GUIDE_URL = `${DOCS_BASE}/guide.md`;
const SSH_KEY_HELP_URL = `${DOCS_BASE}/ssh-key-help.md`;
function docUrl(filename) {
  return `${DOCS_BASE}/${filename}`;
}

const info = (msg) => console.log(chalk.cyan('[*]'), msg);
const ok = (msg) => console.log(chalk.green('[OK]'), msg);
const warn = (msg) => console.log(chalk.yellow('[!]'), msg);

/** Shown when user has not verified SSH key login — they risk lockout if they enable firewall or harden SSH. */
function warnUnverifiedKeyLogin() {
  console.log(chalk.red.bold('\n!!!  YOU DID NOT VERIFY KEY LOGIN  !!!\n'));
  console.log(chalk.red('If you run Firewall (UFW) or SSH hardening next WITHOUT testing in another terminal,'));
  console.log(chalk.red('you can be LOCKED OUT of this server. Password login may be disabled; if your key'));
  console.log(chalk.red('does not work, you will have no way to log in.\n'));
  console.log(chalk.yellow.bold('Before running Phase B or D: open a NEW terminal, ssh in with your key, run sudo -v.'));
  console.log(chalk.yellow('Only then run firewall or SSH hardening here.\n'));
}
const err = (msg) => {
  console.error(chalk.red('[ERROR]'), msg);
  process.exit(1);
};

/** Run a phase only when not already satisfied, unless opts.force. When satisfied and !force: info and return true (caller should return). */
function shouldSkipPhase(opts, satisfied) {
  if (!opts || typeof opts !== 'object') return false;
  if (opts.force) return false;
  if (satisfied) {
    info('Already applied. Use --force to re-run.');
    return true;
  }
  return false;
}

/** True if we need to prefix privileged commands with sudo (running as non-root). */
let useSudo = false;

/** Run a command with root privileges (direct if root, else via sudo). */
function runRoot(cmd, options = {}) {
  const { capture = false, allowFail = false, stdin: stdinContent } = options;
  const toRun = useSudo ? ['sudo', ...cmd] : cmd;
  const stdio = stdinContent !== undefined
    ? ['pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit']
    : (capture ? 'pipe' : 'inherit');
  const result = spawnSync(toRun[0], toRun.slice(1), {
    stdio,
    encoding: 'utf8',
    shell: false,
    input: stdinContent,
  });
  if (result.status !== 0 && !allowFail) {
    const msg = (result.stderr || result.stdout || '').trim() || `Command failed: ${toRun.join(' ')}`;
    throw new Error(msg);
  }
  return result;
}

/** Write content to a path that requires root (e.g. /etc/...). */
function writeFileRoot(path, content) {
  if (useSudo) {
    const tmp = join(tmpdir(), `vps-setup-${Date.now()}-${path.replace(/\//g, '-')}`);
    writeFileSync(tmp, content);
    try {
      runRoot(['cp', tmp, path]);
    } finally {
      try { unlinkSync(tmp); } catch {}
    }
  } else {
    writeFileSync(path, content);
  }
}

async function promptYn(message, defaultChoice = 's') {
  const choice = await select({
    message,
    default: defaultChoice,
    choices: [
      { name: 'Yes', value: 'y' },
      { name: 'No', value: 'n' },
      { name: 'Skip', value: 's' },
    ],
  });
  return choice;
}

/** Read /etc/os-release (or ID from env for testing). */
function readOsRelease() {
  const path = process.env.OS_RELEASE_PATH || '/etc/os-release';
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf8');
  const out = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Detect distro and package manager. Returns { id, pkgManager, sudoGroup }. Cached after first call. */
let _distroCache = null;
function getDistro() {
  if (_distroCache) return _distroCache;
  const os = readOsRelease();
  const id = (os.ID || '').toLowerCase();
  const like = (os.ID_LIKE || '').toLowerCase();
  let pkgManager = null;
  let sudoGroup = 'sudo';
  if (id === 'debian' || id === 'ubuntu' || like.includes('debian') || like.includes('ubuntu')) {
    try { execSync('which apt-get', { stdio: 'pipe' }); pkgManager = 'apt'; } catch {}
    sudoGroup = 'sudo';
  } else if (id === 'fedora' || id === 'rhel' || id === 'centos' || id === 'rocky' || id === 'alma' || like.includes('fedora') || like.includes('rhel')) {
    try { execSync('which dnf', { stdio: 'pipe' }); pkgManager = 'dnf'; } catch {}
    if (!pkgManager) try { execSync('which yum', { stdio: 'pipe' }); pkgManager = 'yum'; } catch {}
    sudoGroup = 'wheel';
  } else if (id === 'arch' || like.includes('arch')) {
    try { execSync('which pacman', { stdio: 'pipe' }); pkgManager = 'pacman'; } catch {}
    sudoGroup = 'wheel';
  } else if (id === 'opensuse' || id === 'sles' || like.includes('suse')) {
    try { execSync('which zypper', { stdio: 'pipe' }); pkgManager = 'zypper'; } catch {}
    sudoGroup = 'wheel';
  }
  _distroCache = { id, pkgManager, sudoGroup };
  return _distroCache;
}

/** Package names per phase per pkgManager. */
const PACKAGES = {
  apt: {
    ufw: ['ufw'],
    updates: ['unattended-upgrades', 'apt-listchanges'],
    nginx: ['nginx', 'certbot', 'python3-certbot-nginx'],
    fail2ban: ['fail2ban'],
    mosh: ['mosh'],
  },
  dnf: {
    ufw: ['ufw'],
    updates: ['dnf-automatic'],
    nginx: ['nginx', 'certbot', 'python3-certbot-nginx'],
    fail2ban: ['fail2ban'],
    mosh: ['mosh'],
  },
  yum: {
    ufw: ['ufw'],
    updates: ['yum-cron'],
    nginx: ['nginx', 'certbot', 'python3-certbot-nginx'],
    fail2ban: ['fail2ban'],
    mosh: ['mosh'],
  },
  pacman: {
    ufw: ['ufw'],
    updates: [],
    nginx: ['nginx', 'certbot', 'certbot-nginx'],
    fail2ban: ['fail2ban'],
    mosh: ['mosh'],
  },
  zypper: {
    ufw: ['ufw'],
    updates: [],
    nginx: ['nginx', 'certbot', 'python3-certbot-nginx'],
    fail2ban: ['fail2ban'],
    mosh: ['mosh'],
  },
};

function pkgUpdate() {
  const { pkgManager } = getDistro();
  if (pkgManager === 'apt') runRoot(['apt-get', 'update', '-qq']);
  else if (pkgManager === 'dnf' || pkgManager === 'yum') {
    runRoot([pkgManager, 'check-update', '-q'], { allowFail: true }); // exit 100 when updates available
  }
  // pacman/zypper: no separate update needed before install
}

function pkgInstall(packages) {
  if (!packages.length) return;
  const { pkgManager } = getDistro();
  if (pkgManager === 'apt') runRoot(['apt-get', 'install', '-y', ...packages]);
  else if (pkgManager === 'dnf' || pkgManager === 'yum') runRoot([pkgManager, 'install', '-y', ...packages]);
  else if (pkgManager === 'pacman') runRoot(['pacman', '-S', '--noconfirm', ...packages]);
  else if (pkgManager === 'zypper') runRoot(['zypper', 'install', '-y', ...packages]);
  else err('No supported package manager found (apt, dnf, yum, pacman, zypper).');
}

/** Ensure we can run as root: if not root, run sudo -v to prompt for password. */
function ensureRoot() {
  if (typeof process.geteuid === 'function' && process.geteuid() === 0) {
    useSudo = false;
    return;
  }
  useSudo = true;
  console.log(chalk.yellow('This tool needs root for some steps. You may be asked for your password.\n'));
  const r = spawnSync('sudo', ['-v'], { stdio: 'inherit', encoding: 'utf8' });
  if (r.status !== 0) err('sudo failed or password not entered. Run with: sudo node run.mjs');
}

function getSudoGroup() {
  return getDistro().sudoGroup;
}

/** Allow only safe Unix usernames (no shell metacharacters). */
function isValidUsername(s) {
  return /^[a-z_][a-z0-9_.-]*$/i.test(s) && s.length <= 32;
}

function readSshKeyFromOpt(sshKey) {
  if (!sshKey) return '';
  const s = String(sshKey).trim();
  if (s.startsWith('ssh-') || s.startsWith('ecdsa-')) return s;
  const path = s.replace(/^~/, process.env.HOME || '');
  try {
    if (existsSync(path)) return readFileSync(path, 'utf8').trim();
  } catch {}
  return s;
}

// --- Phase A: Prerequisites ---
function isPrerequisitesSatisfied(opts) {
  try {
    const user = opts && opts.user ? String(opts.user).trim() : null;
    if (!user) return false;
    const idResult = spawnSync('id', ['--', user], { encoding: 'utf8', stdio: 'pipe' });
    if (idResult.status !== 0) return false;
    const getent = runRoot(['getent', 'passwd', user], { capture: true, allowFail: true });
    const homeDir = getent.status === 0 && getent.stdout ? getent.stdout.split(':')[5] : null;
    const authKeys = homeDir ? `${homeDir}/.ssh/authorized_keys` : `/home/${user}/.ssh/authorized_keys`;
    const testResult = runRoot(['test', '-f', authKeys], { allowFail: true });
    if (testResult.status !== 0) return false;
    const key = opts.sshKey ? readSshKeyFromOpt(opts.sshKey) : null;
    if (key) {
      const content = (runRoot(['cat', authKeys], { capture: true }).stdout || '');
      if (!content.split('\n').some((line) => line.trim() === key.trim())) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function phasePrerequisites(opts) {
  const agentMode = opts && typeof opts === 'object' && (opts.user != null || opts.sshKey != null);
  console.log('\n' + chalk.bold('========== Phase A: Prerequisites =========='));
  if (agentMode && opts.user && shouldSkipPhase(opts, isPrerequisitesSatisfied(opts))) return;
  if (!agentMode) {
    console.log('Before firewall or SSH changes:');
    console.log('  1. Create a non-root user with sudo');
    console.log('  2. Add your SSH public key to that user\'s ~/.ssh/authorized_keys');
    console.log('  3. From your laptop: ssh myuser@<vps-ip> and run sudo -v');
    console.log('  4. Keep this session open and open a second terminal to test after changes.\n');
  }

  let newuser;
  if (agentMode && opts.user) {
    newuser = String(opts.user).trim();
    if (!newuser) {
      warn('Phase prerequisites: --user is required in agent mode.');
      return;
    }
  } else {
    const createUser = await promptYn('Do you want to create a new sudo user now?', 'n');
    if (createUser !== 'y') {
      const verified = await promptYn('Have you verified key login and sudo from another terminal?', 's');
      if (verified !== 'y') {
        warnUnverifiedKeyLogin();
        info(`Manual steps: ${docUrl('phase-a-prerequisites.md')}`);
      }
      return;
    }
    newuser = (await input({ message: 'Username for new admin user', default: '' })).trim();
    if (!newuser) {
      warn('Skipping user creation.');
      info(`To create a user and add keys manually: ${docUrl('phase-a-prerequisites.md')}`);
      return;
    }
  }
  if (!isValidUsername(newuser)) {
    err('Invalid username: use only letters, numbers, underscore, hyphen, period (e.g. deploy, my_admin).');
  }

  const sudoGroup = getSudoGroup();
  const idResult = spawnSync('id', ['--', newuser], { encoding: 'utf8', stdio: 'pipe' });
  if (idResult.status === 0) {
    ok(`User ${newuser} already exists.`);
  } else {
    const { pkgManager } = getDistro();
    if (pkgManager === 'apt') {
      runRoot(['adduser', '--disabled-password', '--gecos', '', newuser]);
    } else {
      runRoot(['useradd', '-m', '-s', '/bin/bash', newuser]);
      runRoot(['passwd', '-l', newuser]);
    }
    runRoot(['usermod', '-aG', sudoGroup, newuser]);
    ok(`Created ${newuser} and added to ${sudoGroup} group.`);
  }

  // Use actual home from passwd so system users (e.g. home=/opt/deploy) work
  const getent = runRoot(['getent', 'passwd', newuser], { capture: true });
  const homeDir = (getent.stdout || '').split(':')[5] || `/home/${newuser}`;
  const sshDir = `${homeDir}/.ssh`;
  runRoot(['mkdir', '-p', sshDir]);
  runRoot(['chmod', '700', sshDir]);
  runRoot(['chown', `${newuser}:${newuser}`, sshDir]);

  let pubkey;
  if (agentMode) {
    pubkey = readSshKeyFromOpt(opts.sshKey);
  } else {
  const hostOs = await select({
    message: 'What OS is your laptop / the machine you’ll SSH from?',
    choices: [
      { name: 'macOS', value: 'macos' },
      { name: 'Windows', value: 'windows' },
      { name: 'Linux', value: 'linux' },
    ],
  });

    const sshKeyHints = {
      macos: [
        'Copy to clipboard:  pbcopy < ~/.ssh/id_ed25519.pub   (or id_rsa.pub)',
        'Then paste here (Cmd+V).',
        'Key file missing? Generate:  ssh-keygen -t ed25519 -C you@example.com -f ~/.ssh/id_ed25519 -N ""',
      ],
      windows: [
        'PowerShell:  Get-Content $env:USERPROFILE\\.ssh\\id_ed25519.pub | Set-Clipboard   then paste (Ctrl+V).',
        'Or open in Notepad:  notepad %USERPROFILE%\\.ssh\\id_ed25519.pub   and copy the full line.',
        'Key file missing? In PowerShell:  ssh-keygen -t ed25519 -C you@example.com -f $env:USERPROFILE\\.ssh\\id_ed25519 -N ""',
      ],
      linux: [
        'Show key:  cat ~/.ssh/id_ed25519.pub   (or id_rsa.pub). Copy the full line and paste here.',
        'With xclip:  xclip -selection clipboard < ~/.ssh/id_ed25519.pub   then paste.',
        'Key file missing? Generate:  ssh-keygen -t ed25519 -C you@example.com -f ~/.ssh/id_ed25519 -N ""',
      ],
    };
    const lines = sshKeyHints[hostOs];
    console.log(chalk.cyan('\n  SSH key — copy from your laptop and paste below:'));
    lines.forEach((line) => console.log(chalk.cyan('  ' + line)));
    console.log('');
    pubkey = (await input({ message: 'Paste your SSH public key (one line), then Enter', default: '' })).trim();
  }

  if (pubkey) {
    const authKeys = `${sshDir}/authorized_keys`;
    const keyTrim = pubkey.trim();
    const existing = runRoot(['cat', authKeys], { capture: true, allowFail: true });
    const existingContent = existing.status === 0 ? (existing.stdout || '') : '';
    const alreadyPresent = existingContent.split('\n').some((line) => line.trim() === keyTrim);
    if (alreadyPresent) {
      ok(`Key already in authorized_keys. Test with: ssh ${newuser}@<this-server-ip>`);
    } else {
      if (useSudo) {
        const tmp = join(tmpdir(), `vps-setup-key-${Date.now()}`);
        writeFileSync(tmp, keyTrim + '\n');
        try {
          spawnSync('sudo', ['sh', '-c', `cat "${tmp}" >> "${authKeys}"`], { stdio: 'inherit', shell: false });
        } finally {
          try { unlinkSync(tmp); } catch {}
        }
      } else {
        writeFileSync(authKeys, keyTrim + '\n', { flag: 'a' });
      }
      runRoot(['chown', `${newuser}:${newuser}`, authKeys]);
      runRoot(['chmod', '600', authKeys]);
      ok(`Key added. Test with: ssh ${newuser}@<this-server-ip>`);
    }
  } else {
    if (!agentMode) {
      warn('No key entered.');
      info('If the key file is missing, on your laptop run:  ssh-keygen -t ed25519 -C you@example.com -f ~/.ssh/id_ed25519 -N ""  then copy the .pub file and run this phase again.');
      info(`Full copy-paste and generate steps: ${SSH_KEY_HELP_URL}`);
      warn(`Or add the key manually later to ${sshDir}/authorized_keys`);
    }
  }

  // Sudo: NOPASSWD or set a password for the new user
  const sudoChoice = agentMode
    ? (opts.sudoNopasswd === true ? 'nopasswd' : null)
    : (await select({
        message: `Sudo for ${newuser}: use NOPASSWD (no password) or set a password now?`,
        default: 'nopasswd',
        choices: [
          { name: 'NOPASSWD — no password needed for sudo (common for automation)', value: 'nopasswd' },
          { name: 'Set a password — I will type it now; sudo will prompt for it', value: 'password' },
        ],
      }));

  if (sudoChoice === 'nopasswd') {
    const sudoersSafe = newuser.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sudoersPath = `/etc/sudoers.d/99-vps-setup-${sudoersSafe}`;
    const content = `${newuser} ALL=(ALL) NOPASSWD:ALL\n`;
    writeFileRoot(sudoersPath, content);
    runRoot(['chmod', '440', sudoersPath]);
    const check = runRoot(['visudo', '-c', '-f', sudoersPath], { allowFail: true });
    if (check.status !== 0) {
      runRoot(['rm', '-f', sudoersPath]);
      err(`Sudoers file failed validation. Removed ${sudoersPath}. Check username.`);
    }
    ok(`${newuser} can run sudo without a password (NOPASSWD).`);
  } else if (sudoChoice === 'password') {
    console.log(chalk.cyan(`\n  Enter a password for ${newuser} (sudo will ask for it when needed):\n`));
    const passwdResult = spawnSync(useSudo ? 'sudo' : 'passwd', useSudo ? ['passwd', newuser] : [newuser], {
      stdio: 'inherit',
      encoding: 'utf8',
    });
    if (passwdResult.status !== 0) {
      warn('Setting password failed or was cancelled. You can run: sudo passwd ' + newuser + ' later.');
    } else {
      ok(`Password set for ${newuser}. They will type it when sudo prompts.`);
    }
  }

  if (!agentMode) {
    const verified = await promptYn('Have you verified key login and sudo from another terminal?', 's');
    if (verified !== 'y') warnUnverifiedKeyLogin();
  }
}

// --- Phase B: Firewall ---
function isFirewallSatisfied(opts) {
  try {
    const r = runRoot(['ufw', 'status'], { capture: true, allowFail: true });
    if (r.status !== 0 || !(r.stdout || '').toLowerCase().includes('status: active')) return false;
    const allowPorts = (opts && opts.allow ? String(opts.allow) : '22,80,443').split(',').map((p) => p.trim()).filter(Boolean);
    const out = (r.stdout || '');
    for (const p of allowPorts) {
      const suffix = p.includes('/') ? p : `${p}/tcp`;
      if (!out.includes(suffix)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function phaseFirewall(opts) {
  const agentMode = opts && typeof opts === 'object';
  console.log('\n' + chalk.bold('========== Phase B: Firewall (UFW) =========='));
  if (shouldSkipPhase(opts, isFirewallSatisfied(opts))) return;
  if (!agentMode) {
    console.log('Will: install ufw, set default deny incoming, allow 22/80/443, deny 3000/8080, enable.\n');
    console.log(chalk.dim('  Tip: If you get locked out after enabling UFW, use your provider\'s recovery console and run: sudo ufw allow 22/tcp\n'));
  }

  if (!agentMode && (await promptYn('Configure UFW?', 'y')) !== 'y') {
    info(`Manual steps and lockout recovery: ${docUrl('phase-b-firewall.md')}`);
    return;
  }

  const { pkgManager } = getDistro();
  const ufwPkgs = (PACKAGES[pkgManager] && PACKAGES[pkgManager].ufw) || ['ufw'];
  const spinner = ora('Updating packages and installing UFW...').start();
  try {
    pkgUpdate();
    pkgInstall(ufwPkgs);
    spinner.succeed('UFW installed.');
  } catch (e) {
    spinner.fail('Failed.');
    throw e;
  }

  runRoot(['ufw', 'default', 'deny', 'incoming']);
  runRoot(['ufw', 'default', 'allow', 'outgoing']);
  runRoot(['ufw', 'default', 'deny', 'forward']);

  const allowPorts = agentMode ? String(opts.allow || '22,80,443').split(',') : ['22', '80', '443'];
  for (const p of allowPorts) {
    const port = p.trim();
    if (port) runRoot(['ufw', 'allow', port.includes('/') ? port : port + '/tcp']);
  }
  const denyPorts = agentMode ? String(opts.deny || '3000,8080').split(',') : ['3000', '8080'];
  for (const p of denyPorts) {
    const port = p.trim();
    if (/^\d+$/.test(port)) runRoot(['ufw', 'deny', port]);
  }

  if (!agentMode) {
    const extra = (await input({ message: 'Extra ports to DENY (space-separated, or Enter to skip', default: '' })).trim();
    for (const p of extra.split(/\s+/)) {
      if (/^\d+$/.test(p)) runRoot(['ufw', 'deny', p]);
    }
  }

  const ufwDefault = '/etc/default/ufw';
  const ufwDefaultResult = runRoot(['test', '-f', ufwDefault], { allowFail: true });
  if (ufwDefaultResult.status === 0) {
    const r = runRoot(['cat', ufwDefault], { capture: true });
    let content = r.stdout || '';
    if (!content.includes('IPV6=yes') && content.includes('IPV6=')) {
      content = content.replace(/^IPV6=.*/m, 'IPV6=yes');
      writeFileRoot(ufwDefault, content);
    }
  }

  console.log('');
  runRoot(['ufw', 'show', 'added']);

  const doEnable = agentMode ? opts.enable === true : (await promptYn('Enable UFW now? (SSH must be allowed or you may lock out)', 'y')) === 'y';
  if (doEnable) {
    runRoot(['ufw', '--force', 'enable']);
    ok('UFW enabled.');
  } else {
    if (!agentMode) {
      warn('UFW not enabled. Run: sudo ufw enable');
      info(`Recovery and manual steps: ${docUrl('phase-b-firewall.md')}`);
    }
  }
}

// --- Phase C: Updates ---
function isUpdatesSatisfied() {
  try {
    const { pkgManager } = getDistro();
    if (pkgManager === 'apt') {
      const path = '/etc/apt/apt.conf.d/20auto-upgrades';
      const r = runRoot(['test', '-f', path], { allowFail: true });
      if (r.status !== 0) return false;
      const content = (runRoot(['cat', path], { capture: true }).stdout || '');
      return content.includes('Unattended-Upgrade "1"') || content.includes('Unattended-Upgrade "1";');
    }
    if (pkgManager === 'dnf') {
      const r = runRoot(['systemctl', 'is-enabled', 'dnf-automatic-install.timer'], { capture: true, allowFail: true });
      return r.status === 0 && (r.stdout || '').trim() === 'enabled';
    }
    if (pkgManager === 'yum') {
      const r = runRoot(['systemctl', 'is-enabled', 'yum-cron'], { capture: true, allowFail: true });
      return r.status === 0 && (r.stdout || '').trim() === 'enabled';
    }
    return false;
  } catch {
    return false;
  }
}

async function phaseUpdates(opts) {
  console.log('\n' + chalk.bold('========== Phase C: Automatic security updates =========='));
  const { pkgManager } = getDistro();
  const updatePkgs = (PACKAGES[pkgManager] && PACKAGES[pkgManager].updates) || [];
  const agentMode = opts && typeof opts === 'object';
  if (shouldSkipPhase(opts, isUpdatesSatisfied())) return;
  if (updatePkgs.length === 0) {
    warn('Automatic security updates are not configured for this distro. Configure manually if desired.');
    info(`Per-distro notes: ${docUrl('phase-c-updates.md')}`);
    return;
  }
  if (!agentMode) {
    console.log('Will: install and enable automatic security updates (no auto-reboot).\n');
    const pm = getDistro().pkgManager;
    console.log(chalk.dim(`  This distro uses: ${pm === 'apt' ? 'unattended-upgrades' : pm === 'dnf' ? 'dnf-automatic' : 'yum-cron'}\n`));
    if ((await promptYn('Configure automatic updates?', 'y')) !== 'y') {
      info(`Manual steps: ${docUrl('phase-c-updates.md')}`);
      return;
    }
  } else if (!opts.enable) {
    return;
  }

  const spinner = ora('Installing and configuring...').start();
  try {
    pkgUpdate();
    pkgInstall(updatePkgs);
    if (pkgManager === 'apt') {
      writeFileRoot(
        '/etc/apt/apt.conf.d/20auto-upgrades',
        'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n'
      );
      const fifty = '/etc/apt/apt.conf.d/50unattended-upgrades';
      if (existsSync(fifty) && readFileSync(fifty, 'utf8').includes('updates";')) {
        warn('50unattended-upgrades may include -updates. Check that file.');
      }
    } else if (pkgManager === 'dnf') {
      runRoot(['systemctl', 'enable', '--now', 'dnf-automatic-install.timer']);
    } else if (pkgManager === 'yum') {
      runRoot(['systemctl', 'enable', '--now', 'yum-cron']);
    }
    spinner.succeed('Automatic updates configured.');
  } catch (e) {
    spinner.fail('Failed.');
    warn(`Troubleshooting: ${docUrl('phase-c-updates.md')}`);
    throw e;
  }
  ok('Security updates will run automatically (daily/timer).');
}

// --- Phase D: SSH ---
function isSshSatisfied() {
  try {
    const r = runRoot(['test', '-f', '/etc/ssh/sshd_config.d/99-vps-setup.conf'], { allowFail: true });
    return r.status === 0;
  } catch {
    return false;
  }
}

async function phaseSsh(opts) {
  const agentMode = opts && typeof opts === 'object';
  console.log('\n' + chalk.bold('========== Phase D: SSH hardening =========='));
  if (shouldSkipPhase(opts, isSshSatisfied())) return;

  if (!agentMode) {
    console.log(chalk.red.bold('\n!!!  WARNING: YOU CAN BE LOCKED OUT OF THIS SERVER  !!!\n'));
    console.log(chalk.red('SSH hardening will disable password login and/or root login.'));
    console.log(chalk.yellow('Verify key-only login in a SEPARATE terminal first.\n'));
    const verified = await select({
      message: 'Have you verified key-only login from another terminal?',
      choices: [
        { name: 'Yes — I have logged in with my key only and I am sure', value: 'y' },
        { name: 'No / Skip', value: 'n' },
      ],
    });
    if (verified !== 'y') {
      console.log(chalk.red.bold('\n!!!  SSH HARDENING SKIPPED — YOU DID NOT VERIFY KEY LOGIN  !!!\n'));
      console.log(chalk.red('Do NOT enable firewall or change SSH until you have logged in from another'));
      console.log(chalk.red('terminal with your key only and confirmed sudo works. Otherwise you risk lockout.\n'));
      info(`Manual config and lockout recovery: ${docUrl('phase-d-ssh.md')}`);
      return;
    }
    console.log('\nOptions: Match (safe) or Harden (key-only, AllowUsers)\n');
    if ((await promptYn('Configure SSH drop-in?', 'y')) !== 'y') {
      info(`Manual SSH hardening: ${docUrl('phase-d-ssh.md')}`);
      return;
    }
  }

  const sshdD = '/etc/ssh/sshd_config.d';
  runRoot(['mkdir', '-p', sshdD]);
  const dropin = `${sshdD}/99-vps-setup.conf`;

  const choice = agentMode
    ? (String(opts.level || 'match').toLowerCase() === 'harden' ? '2' : '1')
    : (await select({
        message: 'Hardening level',
        default: '1',
        choices: [
          { name: 'Match only (safe)', value: '1' },
          { name: 'Harden (key-only, no root, MaxAuthTries 3, X11 off, AllowUsers)', value: '2' },
        ],
      }));

  let allowUsers = '';
  if (choice === '2') {
    if (agentMode) {
      const raw = String(opts.allowUsers || process.env.SUDO_USER || process.env.USER || 'root').trim();
      const names = raw.split(/[\s,]+/).filter(Boolean).filter(isValidUsername);
      if (names.length === 0) err('Phase ssh: --allow-users required when --level=harden (comma-separated usernames).');
      allowUsers = names.join(' ');
    } else {
      const current = process.env.SUDO_USER || process.env.USER || 'root';
      const raw = (await input({
        message: 'AllowUsers: comma-separated list, or Enter for current user only',
        default: current,
      })).trim();
      if (raw) {
        const names = raw.split(/[\s,]+/).filter(Boolean).filter(isValidUsername);
        if (names.length === 0) err('No valid usernames.');
        allowUsers = names.join(' ');
      } else {
        allowUsers = isValidUsername(current) ? current : 'root';
      }
    }
  }

  const content =
    choice === '2'
      ? `# Created by vps-setup run.mjs - SSH hardening
KbdInteractiveAuthentication no
PasswordAuthentication no
PermitRootLogin no
MaxAuthTries 3
X11Forwarding no
AllowUsers ${allowUsers}
`
      : `# Created by vps-setup run.mjs - match current VPS
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
`;

  writeFileRoot(dropin, content);
  runRoot(['chmod', '644', dropin]);
  ok(`Wrote ${dropin}`);

  warn('Restart SSH after testing in a NEW terminal: sudo systemctl restart sshd || sudo systemctl restart ssh');
  if (!agentMode) console.log(chalk.dim(`  If you get locked out: ${docUrl('phase-d-ssh.md')}\n`));

  const doRestart = agentMode ? opts.restart === true : (await promptYn('Restart SSH now? (only if you have another session open)', 'n')) === 'y';
  if (doRestart) {
    try {
      runRoot(['systemctl', 'restart', 'sshd']);
    } catch {
      runRoot(['systemctl', 'restart', 'ssh']);
    }
    ok('SSH restarted. Test login in a new terminal before closing this one.');
  }
}

// --- Phase E: Sudo ---
function isSudoSatisfied() {
  try {
    const cloudSudo = '/etc/sudoers.d/90-cloud-init-users';
    const r = runRoot(['test', '-f', cloudSudo], { allowFail: true });
    if (r.status !== 0) return true; // no file = nothing to fix
    const catResult = runRoot(['cat', cloudSudo], { capture: true, allowFail: true });
    if (catResult.status !== 0) return false;
    const content = catResult.stdout || '';
    const hasNopasswd = /^\s*root\s+ALL=.*NOPASSWD/m.test(content);
    return !hasNopasswd; // satisfied when no uncommented NOPASSWD
  } catch {
    return false;
  }
}

async function phaseSudo(opts) {
  const agentMode = opts && typeof opts === 'object' && opts.removeNopasswd === true;
  console.log('\n' + chalk.bold('========== Phase E: Sudo / cloud-init =========='));
  if (shouldSkipPhase(opts, isSudoSatisfied())) return;
  if (!agentMode) console.log(chalk.dim('  Only applies to cloud images that add a root NOPASSWD rule (e.g. 90-cloud-init-users).\n'));
  const cloudSudo = '/etc/sudoers.d/90-cloud-init-users';
  const existsCheck = runRoot(['test', '-f', cloudSudo], { allowFail: true });
  if (existsCheck.status !== 0) {
    info('No cloud-init sudoers file found. Nothing to change.');
    info(`Manual sudoers editing: ${docUrl('phase-e-sudo.md')}`);
    return;
  }
  const catResult = runRoot(['cat', cloudSudo], { capture: true, allowFail: true });
  if (catResult.status !== 0) {
    warn(`Cannot read ${cloudSudo}. Skipping.`);
    info(`Use visudo and see: ${docUrl('phase-e-sudo.md')}`);
    return;
  }
  const content = catResult.stdout || '';
  if (!content.includes('NOPASSWD')) {
    info('No root NOPASSWD in file. Nothing to change.');
    return;
  }
  if (!agentMode) {
    console.log(`Found root NOPASSWD in ${cloudSudo} (weakens audit).`);
    if ((await promptYn('Remove or comment out root NOPASSWD?', 'n')) !== 'y') {
      info(`Manual steps and recovery: ${docUrl('phase-e-sudo.md')}`);
      return;
    }
  }

  const newContent = content.replace(/^(\s*root\s+ALL=.*NOPASSWD.*)$/gm, '# $1');
  writeFileRoot(cloudSudo + '.bak', content);
  writeFileRoot(cloudSudo, newContent);
  ok('Commented out. Restored from ' + cloudSudo + '.bak if needed.');
  info(`Recovery if sudo breaks: ${docUrl('phase-e-sudo.md')}`);
}

// --- Phase F: Nginx (custom domain + optional load balancing) ---

/** Validate a domain name (basic: letters, digits, hyphens, dots; no spaces or special chars). */
function isValidDomain(d) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d) && d.length <= 253;
}

function isValidPort(p) {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function parseBackends(raw) {
  const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of parts) {
    if (s.startsWith(':')) {
      const port = s.slice(1);
      if (isValidPort(port)) out.push(`127.0.0.1:${port}`);
    } else {
      const m = s.match(/^([\w.-]+):(\d+)$/);
      if (m && isValidPort(m[2])) out.push(s);
    }
  }
  return out;
}

function isNginxSatisfied(opts) {
  if (!opts || !opts.domain || !isValidDomain(String(opts.domain).trim())) return false;
  try {
    const primaryDomain = String(opts.domain).trim();
    const safeName = primaryDomain.replace(/[^a-z0-9.-]/gi, '_');
    const confPath = `/etc/nginx/conf.d/vps-setup-${safeName}.conf`;
    const r = runRoot(['test', '-f', confPath], { allowFail: true });
    return r.status === 0;
  } catch {
    return false;
  }
}

async function phaseNginx(opts) {
  const agentMode = opts && typeof opts === 'object' && opts.domain;
  console.log('\n' + chalk.bold('========== Phase F: Nginx + custom domain + TLS =========='));
  if (agentMode && shouldSkipPhase(opts, isNginxSatisfied(opts))) return;
  if (!agentMode) {
    console.log('Will: install Nginx + Certbot, set up a server block for your domain,');
    console.log('      optionally reverse-proxy / load-balance to backend servers, then obtain Let\'s Encrypt cert.\n');
    if ((await promptYn('Install Nginx and Certbot?', 'n')) !== 'y') {
      info(`Manual Nginx + TLS: ${docUrl('phase-f-nginx.md')}`);
      return;
    }
  }

  const { pkgManager } = getDistro();
  const nginxPkgs = (PACKAGES[pkgManager] && PACKAGES[pkgManager].nginx) || ['nginx', 'certbot'];
  pkgUpdate();
  pkgInstall(nginxPkgs);

  let domainInput, extraList, backends;
  if (agentMode) {
    domainInput = String(opts.domain || '').trim();
    if (!domainInput || !isValidDomain(domainInput)) {
      err('Phase nginx: --domain <primary-domain> is required and must be a valid domain.');
    }
    const extraRaw = String(opts.extraDomains || '').trim();
    extraList = extraRaw ? extraRaw.split(',').map((d) => d.trim()).filter(Boolean).filter(isValidDomain) : [];
    const backendRaw = String(opts.backends || '').trim();
    backends = backendRaw ? parseBackends(backendRaw) : [];
  } else {
    console.log(chalk.cyan('\n  Ensure your domain\'s DNS A record points to this server\'s IP before Certbot runs.\n'));
    domainInput = (await input({
      message: 'Primary domain (e.g. example.com)',
      default: '',
    })).trim();
    if (!domainInput) {
      warn('No domain. Run later: certbot --nginx -d yourdomain.com');
      info(`Full steps: ${docUrl('phase-f-nginx.md')}`);
      return;
    }
    if (!isValidDomain(domainInput)) {
      warn(`"${domainInput}" doesn't look like a valid domain. Skipping Nginx config.`);
      info(`Domain format and manual setup: ${docUrl('phase-f-nginx.md')}`);
      return;
    }
    const extraDomains = (await input({
      message: 'Extra domains for same cert, comma-separated (e.g. www.example.com), or Enter to skip',
      default: '',
    })).trim();
    extraList = extraDomains.split(',').map((d) => d.trim()).filter(Boolean);
    const invalidExtras = extraList.filter((d) => !isValidDomain(d));
    if (invalidExtras.length > 0) warn(`Ignoring invalid domain(s): ${invalidExtras.join(', ')}`);
    extraList = extraList.filter(isValidDomain);
    const useProxy = await promptYn('Reverse-proxy / load balance to backend servers on this VPS?', 'n');
    backends = [];
    if (useProxy === 'y') {
      const backendInput = (await input({
        message: 'Backend addresses (host:port), space or comma separated (e.g. 127.0.0.1:3000 127.0.0.1:3001 or :8080 for localhost)',
        default: '127.0.0.1:3000',
      })).trim();
      backends = parseBackends(backendInput);
      if (backends.length === 0) warn('No valid backends. Using simple placeholder server block.');
    }
  }

  const domainList = [domainInput, ...extraList];
  const primaryDomain = domainList[0];
  const serverNames = domainList.join(' ');

  runRoot(['systemctl', 'enable', 'nginx'], { allowFail: true });
  runRoot(['systemctl', 'start', 'nginx'], { allowFail: true });

  const confDir = '/etc/nginx/conf.d';
  runRoot(['mkdir', '-p', confDir]);
  const safeName = primaryDomain.replace(/[^a-z0-9.-]/gi, '_');
  const confPath = `${confDir}/vps-setup-${safeName}.conf`;

  let serverBlock;
  if (backends.length > 0) {
    const upstreamName = `backend_${safeName.replace(/\./g, '_')}`;
    const servers = backends.map((b) => `    server ${b};`).join('\n');
    serverBlock = `
# Upstream: load balancing (round-robin) across backends
upstream ${upstreamName} {
${servers}
}

server {
    listen 80;
    server_name ${serverNames};
    location / {
        proxy_pass http://${upstreamName};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
}
`;
  } else {
    serverBlock = `
server {
    listen 80;
    server_name ${serverNames};
    root /var/www/html;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
`;
  }

  const configContent = `# Generated by vps-setup for ${primaryDomain}
${serverBlock.trim()}
`;

  writeFileRoot(confPath, configContent);
  ok(`Wrote ${confPath}`);

  const testResult = runRoot(['nginx', '-t'], { capture: true, allowFail: true });
  if (testResult.status !== 0) {
    warn(`Nginx config test failed: ${(testResult.stderr || testResult.stdout || '').trim()}`);
    warn(`Fix the config at ${confPath} and run: sudo nginx -t && sudo systemctl reload nginx`);
    info(`Troubleshooting: ${docUrl('phase-f-nginx.md')}`);
    return;
  }
  runRoot(['systemctl', 'reload', 'nginx']);
  ok('Nginx reloaded.');

  const runCertbot = agentMode ? opts.certbot !== false : true;
  if (runCertbot) {
    const certDomains = domainList.flatMap((d) => ['-d', d]);
    const result = runRoot(
      ['certbot', '--nginx', '--non-interactive', '--agree-tos', '--register-unsafely-without-email', ...certDomains],
      { allowFail: true }
    );
    if (result.status === 0) {
      ok('TLS certificate obtained.');
      if (backends.length > 0) info(`HTTPS traffic to ${primaryDomain} is load-balanced across ${backends.length} backend(s).`);
    } else {
      warn('Certbot failed (e.g. DNS not pointing here). Run manually: sudo certbot --nginx -d ' + primaryDomain);
      info(`Certbot and DNS troubleshooting: ${docUrl('phase-f-nginx.md')}`);
    }
  }
  if (!agentMode) console.log('You can add security headers in the server block (e.g. add_header X-Frame-Options SAMEORIGIN;).');
}

// --- Phase G: Fail2ban ---
function isFail2banSatisfied() {
  try {
    const r = runRoot(['systemctl', 'is-active', 'fail2ban'], { capture: true, allowFail: true });
    return r.status === 0 && (r.stdout || '').trim() === 'active';
  } catch {
    return false;
  }
}

async function phaseFail2ban(opts) {
  const agentMode = opts && typeof opts === 'object';
  console.log('\n' + chalk.bold('========== Phase G: Fail2ban =========='));
  if (shouldSkipPhase(opts, isFail2banSatisfied())) return;
  if (!agentMode) {
    console.log('Will: install fail2ban, enable sshd jail.\n');
    console.log(chalk.dim('  If fail2ban bans your IP, unban from another machine or provider console: sudo fail2ban-client set sshd unbanip <your-ip>\n'));
    if ((await promptYn('Install and enable fail2ban (sshd jail)?', 'n')) !== 'y') {
      info(`Manual setup and unban: ${docUrl('phase-g-fail2ban.md')}`);
      return;
    }
  } else if (!opts.enable) {
    return;
  }

  const { pkgManager } = getDistro();
  const f2bPkgs = (PACKAGES[pkgManager] && PACKAGES[pkgManager].fail2ban) || ['fail2ban'];
  const spinner = ora('Installing fail2ban...').start();
  try {
    pkgUpdate();
    pkgInstall(f2bPkgs);
    runRoot(['systemctl', 'enable', 'fail2ban']);
    runRoot(['systemctl', 'start', 'fail2ban']);
    spinner.succeed('Fail2ban enabled. Check: sudo fail2ban-client status sshd');
  } catch (e) {
    spinner.fail('Failed.');
    warn(`Troubleshooting: ${docUrl('phase-g-fail2ban.md')}`);
    throw e;
  }
}

// --- UFW logging ---
function isUfwLoggingSatisfied(opts) {
  try {
    const level = (opts && opts.level ? String(opts.level) : 'medium').toLowerCase();
    const r = runRoot(['ufw', 'status', 'verbose'], { capture: true, allowFail: true });
    if (r.status !== 0) return false;
    const line = (r.stdout || '').split('\n').find((l) => l.toLowerCase().includes('logging'));
    if (!line) return false;
    return line.toLowerCase().includes(level);
  } catch {
    return false;
  }
}

async function phaseUfwLogging(opts) {
  const agentMode = opts && typeof opts === 'object' && opts.level;
  console.log('\n' + chalk.bold('========== UFW logging =========='));
  if (shouldSkipPhase(opts, isUfwLoggingSatisfied(opts))) return;
  if (!agentMode) {
    try {
      const r = runRoot(['ufw', 'status', 'verbose'], { capture: true, allowFail: true });
      const line = (r.stdout || '').split('\n').find((l) => l.toLowerCase().includes('logging'));
      if (line) console.log(line);
    } catch {}
    if ((await promptYn("Set UFW logging to 'medium' for better visibility?", 'n')) === 'y') {
      runRoot(['ufw', 'logging', 'medium']);
      ok('UFW logging set to medium.');
    } else {
      info(`Manual: ${docUrl('phase-h-ufw-logging.md')}`);
    }
    return;
  }
  const level = String(opts.level).toLowerCase();
  if (!['off', 'low', 'medium', 'high', 'full'].includes(level)) {
    err('Phase ufw-logging: --level must be one of: off, low, medium, high, full');
  }
  runRoot(['ufw', 'logging', level]);
  ok(`UFW logging set to ${level}.`);
}

// --- Phase M: Mosh ---
function isMoshSatisfied() {
  try {
    const which = spawnSync('which', ['mosh-server'], { encoding: 'utf8', stdio: 'pipe' });
    if (which.status !== 0) return false;
    const r = runRoot(['ufw', 'status'], { capture: true, allowFail: true });
    return r.status === 0 && (r.stdout || '').includes('60000:61000');
  } catch {
    return false;
  }
}

async function phaseMosh(opts) {
  const agentMode = opts && typeof opts === 'object' && opts.enable === true;
  console.log('\n' + chalk.bold('========== Phase M: Mosh (mobile shell) =========='));
  if (shouldSkipPhase(opts, isMoshSatisfied())) return;
  if (!agentMode) {
    console.log('Will: install mosh server, allow UDP 60000:61000 in UFW (mosh port range).\n');
    const moshClientHints = {
      macos: 'On your Mac install client: brew install mosh',
      windows: 'On Windows: install Mosh from Microsoft Store, or use WSL and run: sudo apt install mosh',
      linux: 'On your laptop: sudo apt install mosh  (or dnf/pacman/zypper)',
    };
    const clientOs = await select({
      message: 'What OS is the machine you\'ll connect from? (for client install hint)',
      choices: [
        { name: 'macOS', value: 'macos' },
        { name: 'Windows', value: 'windows' },
        { name: 'Linux', value: 'linux' },
      ],
    });
    console.log(chalk.cyan('\n  ' + moshClientHints[clientOs]) + '\n');
    console.log('Connect: mosh <user>@<this-server-ip>\n');
    if ((await promptYn('Install Mosh and open firewall?', 'y')) !== 'y') {
      info(`Manual setup: ${docUrl('phase-m-mosh.md')}`);
      return;
    }
  }

  const { pkgManager } = getDistro();
  const moshPkgs = (PACKAGES[pkgManager] && PACKAGES[pkgManager].mosh) || ['mosh'];
  const spinner = ora('Installing mosh...').start();
  try {
    pkgUpdate();
    pkgInstall(moshPkgs);
    spinner.succeed('Mosh installed.');
  } catch (e) {
    spinner.fail('Failed.');
    throw e;
  }

  const ufwStatus = runRoot(['ufw', 'status'], { capture: true, allowFail: true });
  const ufwActive = (ufwStatus.stdout || '').toLowerCase().includes('status: active');
  if (ufwActive) {
    runRoot(['ufw', 'allow', '60000:61000/udp']);
    ok('UFW: allowed UDP 60000:61000 (mosh).');
  } else {
    warn('UFW is not active. After enabling UFW, run: sudo ufw allow 60000:61000/udp');
    info(`Full steps: ${docUrl('phase-m-mosh.md')}`);
  }
  ok('Connect with: mosh <user>@<this-server-ip>');
}

const phases = [
  { key: 'a', label: 'Prerequisites (user + SSH key)', fn: phasePrerequisites },
  { key: 'b', label: 'Firewall (UFW)', fn: phaseFirewall },
  { key: 'c', label: 'Automatic security updates', fn: phaseUpdates },
  { key: 'd', label: 'SSH hardening', fn: phaseSsh },
  { key: 'e', label: 'Sudo (remove root NOPASSWD)', fn: phaseSudo },
  { key: 'f', label: 'Nginx + custom domain + TLS + load balancing (optional)', fn: phaseNginx },
  { key: 'g', label: 'Fail2ban (optional)', fn: phaseFail2ban },
  { key: 'h', label: 'UFW logging medium', fn: phaseUfwLogging },
  { key: 'm', label: 'Mosh (mobile shell)', fn: phaseMosh },
];

async function mainMenu() {
  while (true) {
    const choice = await select({
      message: 'VPS Security Setup — choose phase',
      choices: [
        ...phases.map((p) => ({ name: `${p.key.toUpperCase()}) ${p.label}`, value: p.key })),
        { name: '1) Run all phases in order', value: '1' },
        { name: '?) Guide & troubleshooting', value: '?' },
        { name: 'q) Quit', value: 'q' },
      ],
    });

    if (choice === 'q') {
      console.log('Bye.');
      return;
    }
    if (choice === '?') {
      console.log('\n' + chalk.cyan('Guide & troubleshooting (in-depth details for each phase):'));
      console.log(GUIDE_URL + '\n');
      continue;
    }
    if (choice === '1') {
      for (const p of phases) await p.fn();
      continue;
    }
    const phase = phases.find((p) => p.key === choice);
    if (phase) await phase.fn();
  }
}

async function main() {
  ensureRoot();
  const distro = getDistro();
  if (!distro.pkgManager) {
    warn('No supported package manager detected (apt, dnf, yum, pacman, zypper). Package-install phases may fail.');
  }
  info('VPS Security Setup — interactive. Run phases in order (A then B then C ...).');
  console.log(chalk.dim('  For in-depth details and troubleshooting: ' + GUIDE_URL + '\n'));

  const program = new Command();
  program
    .name('vps-setup')
    .description('VPS security setup: firewall, SSH, updates, Nginx, fail2ban. Interactive (run) or agent-friendly (phase <name> [options]).')
    .addHelpText('after', `
AGENT / AUTOMATION USE (non-interactive, no prompts):
  Run a single phase by name with flags. Required and optional options vary by phase.
  Get per-phase help:  vps-setup phase <name> --help
  Phases skip if already applied; use --force to re-run.

  Guide (web): ${GUIDE_URL}

  Phases: prerequisites | firewall | updates | ssh | sudo | nginx | fail2ban | ufw-logging | mosh

  Examples:
    vps-setup phase prerequisites --user deploy --ssh-key "$(cat ~/.ssh/id_ed25519.pub)"
    vps-setup phase firewall --allow 22,80,443 --deny 3000,8080 --enable
    vps-setup phase updates --enable
    vps-setup phase nginx --domain example.com --backends 127.0.0.1:3000 --certbot
    vps-setup phase fail2ban --enable
    vps-setup phase mosh --enable
`);

  program
    .command('run', { isDefault: true })
    .description('Interactive menu (prompts). Use --all to run every phase with prompts.')
    .option('--all', 'Run all phases in sequence; each phase may prompt.')
    .action(async (opts) => {
      if (opts.all) {
        for (const p of phases) await p.fn();
        return;
      }
      await mainMenu();
    });

  const phaseCmd = program
    .command('phase')
    .description('Run ONE phase by name (for scripts/agents). No prompts when options are provided. Use: vps-setup phase <name> [options]. List: prerequisites, firewall, updates, ssh, sudo, nginx, fail2ban, ufw-logging, mosh.')
    .option('--force', 'Re-run even if this phase is already applied (default: skip when satisfied)');

  phaseCmd
    .command('prerequisites')
    .description('Create sudo user and add SSH public key.')
    .option('--user <name>', 'Username to create (e.g. deploy). Required in non-interactive mode.')
    .option('--ssh-key <key>', 'SSH public key (one line), or path to .pub file (e.g. ~/.ssh/id_ed25519.pub).')
    .option('--sudo-nopasswd', 'Give the new user NOPASSWD for sudo (no password). Omit to leave default.')
    .option('--force', 'Re-run even if user exists and key is already present')
    .addHelpText('after', 'Agent (no prompts): pass --user and --ssh-key. Optional: --sudo-nopasswd. Example: vps-setup phase prerequisites --user deploy --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" --sudo-nopasswd')
    .action((opts) => phasePrerequisites(opts));

  phaseCmd
    .command('firewall')
    .description('Install UFW, set rules, optionally enable.')
    .option('--allow <ports>', 'Comma-separated TCP ports to allow (default: 22,80,443)', '22,80,443')
    .option('--deny <ports>', 'Comma-separated ports to deny (default: 3000,8080)', '3000,8080')
    .option('--enable', 'Enable UFW. Omit to only write rules.')
    .option('--force', 'Re-run even if UFW is already active with allow ports')
    .addHelpText('after', 'Agent: pass --enable to turn on firewall. Example: vps-setup phase firewall --allow 22,80,443 --enable')
    .action((opts) => phaseFirewall(opts));

  phaseCmd
    .command('updates')
    .description('Enable automatic security updates (apt/dnf/yum).')
    .option('--enable', 'Enable automatic updates. Omit to skip.')
    .option('--force', 'Re-run even if automatic updates already configured')
    .addHelpText('after', 'Agent: pass --enable to configure. Example: vps-setup phase updates --enable')
    .action((opts) => phaseUpdates(opts));

  phaseCmd
    .command('ssh')
    .description('Write SSH drop-in config. Level: match (safe) or harden (key-only, AllowUsers).')
    .option('--level <level>', 'match or harden (default: match)', 'match')
    .option('--allow-users <list>', 'Comma-separated usernames for AllowUsers (required if level=harden)')
    .option('--restart', 'Restart SSH after writing config (only if another session is open)')
    .option('--force', 'Re-run even if SSH drop-in already exists')
    .addHelpText('after', 'Agent: --level match (safe) or harden; if harden, pass --allow-users user1,user2. Optional --restart. Example: vps-setup phase ssh --level harden --allow-users deploy')
    .action((opts) => phaseSsh(opts));

  phaseCmd
    .command('sudo')
    .description('Comment out root NOPASSWD in 90-cloud-init-users (if present).')
    .option('--remove-nopasswd', 'Apply change. Omit to skip.')
    .option('--force', 'Re-run even if NOPASSWD already removed')
    .addHelpText('after', 'Agent: pass --remove-nopasswd to comment out root NOPASSWD. Example: vps-setup phase sudo --remove-nopasswd')
    .action((opts) => phaseSudo(opts));

  phaseCmd
    .command('nginx')
    .description('Install Nginx + Certbot; server block for domain; optional reverse-proxy.')
    .option('--domain <domain>', 'Primary domain (e.g. example.com). Required.')
    .option('--extra-domains <list>', 'Comma-separated extra domains for same cert (e.g. www.example.com)')
    .option('--backends <list>', 'Comma-separated host:port (e.g. 127.0.0.1:3000). Omit for static root.')
    .option('--certbot', 'Run certbot for TLS (default: true)')
    .option('--no-certbot', 'Skip certbot')
    .option('--force', 'Re-run even if server block for this domain already exists')
    .addHelpText('after', 'Agent: pass --domain (required). Optional: --extra-domains, --backends. Use --no-certbot to skip TLS. Example: vps-setup phase nginx --domain example.com --backends 127.0.0.1:3000')
    .action((opts) => phaseNginx(opts));

  phaseCmd
    .command('fail2ban')
    .description('Install and enable fail2ban (sshd jail).')
    .option('--enable', 'Install and enable. Omit to skip.')
    .option('--force', 'Re-run even if fail2ban is already active')
    .addHelpText('after', 'Agent: pass --enable. Example: vps-setup phase fail2ban --enable')
    .action((opts) => phaseFail2ban(opts));

  phaseCmd
    .command('ufw-logging')
    .description('Set UFW logging level (off, low, medium, high, full).')
    .option('--level <level>', 'Logging level (default: medium)', 'medium')
    .option('--force', 'Re-run even if logging already at this level')
    .addHelpText('after', 'Agent: pass --level. Example: vps-setup phase ufw-logging --level medium')
    .action((opts) => phaseUfwLogging(opts));

  phaseCmd
    .command('mosh')
    .description('Install mosh server and allow UDP 60000:61000 in UFW.')
    .option('--enable', 'Install and open firewall. Omit to skip.')
    .option('--force', 'Re-run even if mosh is installed and port range allowed')
    .addHelpText('after', 'Agent: pass --enable. Example: vps-setup phase mosh --enable')
    .action((opts) => phaseMosh(opts));

  program.parse();
}

main().catch((e) => {
  if (e?.name === 'ExitPromptError' || e?.message?.includes('User force closed')) {
    console.log('\nBye.');
    process.exit(0);
  }
  console.error(chalk.red(e.message || e));
  process.exit(1);
});
