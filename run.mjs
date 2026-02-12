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

const info = (msg) => console.log(chalk.cyan('[*]'), msg);
const ok = (msg) => console.log(chalk.green('[OK]'), msg);
const warn = (msg) => console.log(chalk.yellow('[!]'), msg);
const err = (msg) => {
  console.error(chalk.red('[ERROR]'), msg);
  process.exit(1);
};

/** True if we need to prefix privileged commands with sudo (running as non-root). */
let useSudo = false;

function run(cmd, options = {}) {
  const { capture = false, allowFail = false } = options;
  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0 && !allowFail) {
    const msg = (result.stderr || result.stdout || '').trim() || `Command failed: ${cmd.join(' ')}`;
    throw new Error(msg);
  }
  return result;
}

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

/** Detect distro and package manager. Returns { id, pkgManager, sudoGroup }. */
function getDistro() {
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
  return { id, pkgManager, sudoGroup };
}

/** Package names per phase per pkgManager. */
const PACKAGES = {
  apt: {
    ufw: ['ufw'],
    updates: ['unattended-upgrades', 'apt-listchanges'],
    nginx: ['nginx', 'certbot', 'python3-certbot-nginx'],
    fail2ban: ['fail2ban'],
  },
  dnf: {
    ufw: ['ufw'],
    updates: ['dnf-automatic'],
    nginx: ['nginx', 'certbot', 'python3-certbot-nginx'],
    fail2ban: ['fail2ban'],
  },
  yum: {
    ufw: ['ufw'],
    updates: ['dnf-automatic'],
    nginx: ['nginx', 'certbot', 'python3-certbot-nginx'],
    fail2ban: ['fail2ban'],
  },
  pacman: {
    ufw: ['ufw'],
    updates: [],
    nginx: ['nginx', 'certbot'],
    fail2ban: ['fail2ban'],
  },
  zypper: {
    ufw: ['ufw'],
    updates: [],
    nginx: ['nginx', 'certbot'],
    fail2ban: ['fail2ban'],
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

// --- Phase A: Prerequisites ---
async function phasePrerequisites() {
  console.log('\n' + chalk.bold('========== Phase A: Prerequisites =========='));
  console.log('Before firewall or SSH changes:');
  console.log('  1. Create a non-root user with sudo');
  console.log('  2. Add your SSH public key to that user\'s ~/.ssh/authorized_keys');
  console.log('  3. From your laptop: ssh myuser@<vps-ip> and run sudo -v');
  console.log('  4. Keep this session open and open a second terminal to test after changes.\n');

  const createUser = await promptYn('Do you want to create a new sudo user now?', 'n');
  if (createUser !== 'y') {
    const verified = await promptYn('Have you verified key login and sudo from another terminal?', 's');
    if (verified !== 'y') warn('Please verify key login before enabling firewall or changing SSH.');
    return;
  }

  const newuser = (await input({ message: 'Username for new admin user', default: '' })).trim();
  if (!newuser) {
    warn('Skipping user creation.');
    return;
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

  const sshDir = `/home/${newuser}/.ssh`;
  runRoot(['mkdir', '-p', sshDir]);
  runRoot(['chmod', '700', sshDir]);
  runRoot(['chown', `${newuser}:${newuser}`, sshDir]);

  const pubkey = (await input({ message: 'Paste your SSH public key (one line), then Enter', default: '' })).trim();
  if (pubkey) {
    const authKeys = `${sshDir}/authorized_keys`;
    runRoot(['tee', '-a', authKeys], { stdin: pubkey + '\n' });
    runRoot(['chown', `${newuser}:${newuser}`, authKeys]);
    runRoot(['chmod', '600', authKeys]);
    ok(`Key added. Test with: ssh ${newuser}@<this-server-ip>`);
  } else {
    warn(`Add it manually to ${sshDir}/authorized_keys`);
  }

  const verified = await promptYn('Have you verified key login and sudo from another terminal?', 's');
  if (verified !== 'y') warn('Please verify key login before enabling firewall or changing SSH.');
}

// --- Phase B: Firewall ---
async function phaseFirewall() {
  console.log('\n' + chalk.bold('========== Phase B: Firewall (UFW) =========='));
  console.log('Will: install ufw, set default deny incoming, allow 22/80/443, deny 3000/8080, enable.\n');

  if ((await promptYn('Configure UFW?', 'y')) !== 'y') return;

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
  runRoot(['ufw', 'allow', '22/tcp']);
  runRoot(['ufw', 'allow', '80/tcp']);
  runRoot(['ufw', 'allow', '443/tcp']);
  runRoot(['ufw', 'deny', '3000']);
  runRoot(['ufw', 'deny', '8080']);

  const extra = (await input({ message: 'Extra ports to DENY (space-separated, or Enter to skip', default: '' })).trim();
  for (const p of extra.split(/\s+/)) {
    if (/^\d+$/.test(p)) runRoot(['ufw', 'deny', p]);
  }

  const ufwDefault = '/etc/default/ufw';
  if (existsSync(ufwDefault)) {
    let content = readFileSync(ufwDefault, 'utf8');
    if (!content.includes('IPV6=yes') && content.includes('IPV6=')) {
      content = content.replace(/^IPV6=.*/m, 'IPV6=yes');
      writeFileRoot(ufwDefault, content);
    }
  }

  console.log('');
  runRoot(['ufw', 'show', 'added']);

  const enable = await promptYn('Enable UFW now? (SSH must be allowed or you may lock out)', 'y');
  if (enable === 'y') {
    runRoot(['ufw', '--force', 'enable']);
    ok('UFW enabled.');
  } else {
    warn('UFW not enabled. Run: sudo ufw enable');
  }
}

// --- Phase C: Updates ---
async function phaseUpdates() {
  console.log('\n' + chalk.bold('========== Phase C: Automatic security updates =========='));
  const { pkgManager } = getDistro();
  const updatePkgs = (PACKAGES[pkgManager] && PACKAGES[pkgManager].updates) || [];

  if (updatePkgs.length === 0) {
    warn('Automatic security updates are not configured for this distro. Configure manually if desired.');
    return;
  }
  console.log('Will: install and enable automatic security updates (no auto-reboot).\n');
  if ((await promptYn('Configure automatic updates?', 'y')) !== 'y') return;

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
    } else if (pkgManager === 'dnf' || pkgManager === 'yum') {
      runRoot(['systemctl', 'enable', '--now', 'dnf-automatic-install.timer']);
    }
    spinner.succeed('Automatic updates configured.');
  } catch (e) {
    spinner.fail('Failed.');
    throw e;
  }
  ok('Security updates will run automatically (daily/timer).');
}

// --- Phase D: SSH ---
async function phaseSsh() {
  console.log('\n' + chalk.bold('========== Phase D: SSH hardening =========='));

  // Loud mandatory warning: do not proceed without key-only login verified
  console.log(chalk.red.bold('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'));
  console.log(chalk.red.bold('!!!  WARNING: YOU CAN BE LOCKED OUT OF THIS SERVER  !!!'));
  console.log(chalk.red.bold('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'));
  console.log(chalk.red('SSH hardening will disable password login and/or root login.'));
  console.log(chalk.red('If your SSH key login is not working, you will NOT be able to log in again.\n'));
  console.log(chalk.yellow.bold('You MUST do this first, in a SEPARATE terminal (keep this one open):'));
  console.log(chalk.yellow('  1. Open a new terminal on your laptop.'));
  console.log(chalk.yellow('  2. Log in with: ssh <your-user>@<this-server-ip>'));
  console.log(chalk.yellow('  3. Confirm you get in using ONLY your SSH key (no password prompt).'));
  console.log(chalk.yellow('  4. Run "sudo -v" to confirm sudo works.'));
  console.log(chalk.yellow('  5. Leave that session open, then return here.\n'));
  console.log(chalk.red.bold('Only answer Yes below if you have done the above. Otherwise answer No and test first.\n'));

  const verified = await select({
    message: 'Have you verified key-only login from another terminal?',
    choices: [
      { name: 'Yes — I have logged in with my key only and I am sure', value: 'y' },
      { name: 'No / Skip — I have not verified yet (SSH hardening will be skipped)', value: 'n' },
    ],
  });

  if (verified !== 'y') {
    warn('SSH hardening skipped. Verify key-only login, then run this phase again.');
    return;
  }

  console.log('\nOptions:');
  console.log('  - Match: KbdInteractiveAuthentication no, PermitRootLogin prohibit-password');
  console.log('  - Harden: PasswordAuthentication no, MaxAuthTries 3, X11 off, AllowUsers\n');

  if ((await promptYn('Configure SSH drop-in?', 'y')) !== 'y') return;

  const sshdD = '/etc/ssh/sshd_config.d';
  runRoot(['mkdir', '-p', sshdD]);
  const dropin = `${sshdD}/99-vps-setup.conf`;

  const choice = await select({
    message: 'Hardening level',
    default: '1',
    choices: [
      { name: 'Match only (safe)', value: '1' },
      { name: 'Harden (key-only, no root, MaxAuthTries 3, X11 off, AllowUsers)', value: '2' },
    ],
  });

  let allowUsers = '';
  if (choice === '2') {
    const current = process.env.SUDO_USER || process.env.USER || 'root';
    const raw = (await input({
      message: 'AllowUsers: comma-separated list, or Enter for current user only',
      default: current,
    })).trim();
    if (raw) {
      const names = raw.split(/[\s,]+/).filter(Boolean).filter(isValidUsername);
      if (names.length === 0) err('No valid usernames. Use only letters, numbers, underscore, hyphen, period.');
      allowUsers = names.join(' ');
    } else {
      allowUsers = isValidUsername(current) ? current : 'root';
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

  const restart = await promptYn('Restart SSH now? (only if you have another session open)', 'n');
  if (restart === 'y') {
    try {
      runRoot(['systemctl', 'restart', 'sshd']);
    } catch {
      runRoot(['systemctl', 'restart', 'ssh']);
    }
    ok('SSH restarted. Test login in a new terminal before closing this one.');
  }
}

// --- Phase E: Sudo ---
async function phaseSudo() {
  console.log('\n' + chalk.bold('========== Phase E: Sudo / cloud-init =========='));
  const cloudSudo = '/etc/sudoers.d/90-cloud-init-users';
  if (!existsSync(cloudSudo)) {
    info('No cloud-init sudoers file found. Nothing to change.');
    return;
  }
  const content = readFileSync(cloudSudo, 'utf8');
  if (!content.includes('NOPASSWD')) {
    info('No root NOPASSWD in file. Nothing to change.');
    return;
  }
  console.log(`Found root NOPASSWD in ${cloudSudo} (weakens audit).`);
  if ((await promptYn('Remove or comment out root NOPASSWD?', 'n')) !== 'y') return;

  const newContent = content.replace(/^(\s*root\s+ALL=.*NOPASSWD.*)$/gm, '# $1');
  writeFileRoot(cloudSudo + '.bak', content);
  writeFileRoot(cloudSudo, newContent);
  ok('Commented out. Restored from ' + cloudSudo + '.bak if needed.');
}

// --- Phase F: Nginx ---
async function phaseNginx() {
  console.log('\n' + chalk.bold('========== Phase F: Nginx + TLS =========='));
  console.log('Will: install nginx + certbot, obtain Let\'s Encrypt cert.\n');

  if ((await promptYn('Install Nginx and Certbot?', 'n')) !== 'y') return;

  const { pkgManager } = getDistro();
  const nginxPkgs = (PACKAGES[pkgManager] && PACKAGES[pkgManager].nginx) || ['nginx', 'certbot'];
  pkgUpdate();
  pkgInstall(nginxPkgs);
  const domains = (await input({
    message: 'Domain name(s) for TLS, comma-separated (e.g. example.com,www.example.com)',
    default: '',
  })).trim();

  if (!domains) {
    warn('No domain. Run later: certbot --nginx -d yourdomain.com');
    return;
  }

  const parts = domains.split(',').map((d) => d.trim()).filter(Boolean).flatMap((d) => ['-d', d]);
  const result = runRoot(
    ['certbot', '--nginx', '--non-interactive', '--agree-tos', '--register-unsafely-without-email', ...parts],
    { allowFail: true }
  );
  if (result.status === 0) ok('Certbot succeeded.');
  else warn('Certbot failed (e.g. DNS not pointing here). Run manually: sudo certbot --nginx -d <domain>');
  console.log('Add security headers to your HTTPS server block (see plan doc Phase F4).');
}

// --- Phase G: Fail2ban ---
async function phaseFail2ban() {
  console.log('\n' + chalk.bold('========== Phase G: Fail2ban =========='));
  console.log('Will: install fail2ban, enable sshd jail.\n');

  if ((await promptYn('Install and enable fail2ban (sshd jail)?', 'n')) !== 'y') return;

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
    throw e;
  }
}

// --- UFW logging ---
async function phaseUfwLogging() {
  console.log('\n' + chalk.bold('========== UFW logging =========='));
  try {
    const r = runRoot(['ufw', 'status', 'verbose'], { capture: true, allowFail: true });
    const line = (r.stdout || '').split('\n').find((l) => l.toLowerCase().includes('logging'));
    if (line) console.log(line);
  } catch {}
  if ((await promptYn("Set UFW logging to 'medium' for better visibility?", 'n')) === 'y') {
    runRoot(['ufw', 'logging', 'medium']);
    ok('UFW logging set to medium.');
  }
}

const phases = [
  { key: 'a', label: 'Prerequisites (user + SSH key)', fn: phasePrerequisites },
  { key: 'b', label: 'Firewall (UFW)', fn: phaseFirewall },
  { key: 'c', label: 'Automatic security updates', fn: phaseUpdates },
  { key: 'd', label: 'SSH hardening', fn: phaseSsh },
  { key: 'e', label: 'Sudo (remove root NOPASSWD)', fn: phaseSudo },
  { key: 'f', label: 'Nginx + TLS (optional)', fn: phaseNginx },
  { key: 'g', label: 'Fail2ban (optional)', fn: phaseFail2ban },
  { key: 'h', label: 'UFW logging medium', fn: phaseUfwLogging },
];

async function mainMenu() {
  while (true) {
    const choice = await select({
      message: 'VPS Security Setup — choose phase',
      choices: [
        ...phases.map((p) => ({ name: `${p.key.toUpperCase()}) ${p.label}`, value: p.key })),
        { name: '1) Run all (A–E then prompt F/G/H)', value: '1' },
        { name: 'q) Quit', value: 'q' },
      ],
    });

    if (choice === 'q') {
      console.log('Bye.');
      return;
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

  const program = new Command();
  program.name('vps-setup').description('Interactive VPS security setup (UFW, SSH, updates, Nginx, fail2ban)');

  program
    .command('run', { isDefault: true })
    .description('Run interactive menu (or use --all to run all phases with prompts)')
    .option('--all', 'Run all phases in sequence with prompts')
    .action(async (opts) => {
      if (opts.all) {
        for (const p of phases) await p.fn();
        return;
      }
      await mainMenu();
    });

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
