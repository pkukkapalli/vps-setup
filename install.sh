#!/usr/bin/env bash
# Install vps-setup from the latest GitHub release.
# Usage: curl -fsSL https://raw.githubusercontent.com/pkukkapalli/vps-setup/main/install.sh | bash
#        curl -fsSL ... | bash -s -- --install   # install to /usr/local/bin

set -e

REPO='pkukkapalli/vps-setup'
BASE_URL="https://github.com/${REPO}/releases/latest/download"
BINARY_NAME='vps-setup'

case "$(uname -s)" in
  Linux) ;;
  *)
    echo "This script only supports Linux. Download the binary manually from https://github.com/${REPO}/releases" >&2
    exit 1
    ;;
esac

arch="$(uname -m)"
case "$arch" in
  x86_64|x86-64|amd64) ARCH='amd64' ;;
  aarch64|arm64)        ARCH='arm64' ;;
  *)
    echo "Unsupported architecture: $arch. See https://github.com/${REPO}/releases" >&2
    exit 1
    ;;
esac

URL="${BASE_URL}/vps-setup-linux-${ARCH}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
dest="${tmp}/${BINARY_NAME}"

echo "Downloading vps-setup (linux-${ARCH})..."
if ! curl -fSL -o "$dest" "$URL"; then
  echo "Download failed. Check https://github.com/${REPO}/releases" >&2
  exit 1
fi
chmod +x "$dest"

if [ "$1" = '--install' ] || [ "$1" = '-i' ]; then
  install_dest='/usr/local/bin/vps-setup'
  if [ -w "$(dirname "$install_dest")" ]; then
    mv "$dest" "$install_dest"
  else
    echo "Installing to $install_dest (may prompt for password)"
    sudo mv "$dest" "$install_dest"
  fi
  echo "Installed. Run: vps-setup"
else
  mv "$dest" "./${BINARY_NAME}"
  echo "Downloaded ./${BINARY_NAME}. Run: ./${BINARY_NAME}"
fi
