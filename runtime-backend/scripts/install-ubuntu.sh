#!/usr/bin/env bash
set -Eeuo pipefail

# Installer for a dedicated Ubuntu Server 24.04 x86_64 KVM host. It intentionally
# refuses to proceed without /dev/kvm and never downloads any guest operating-system image.
if [[ ${EUID} -ne 0 ]]; then echo 'Run with sudo/root on the dedicated KVM host.' >&2; exit 1; fi
if [[ ! -f /etc/os-release ]]; then echo 'Cannot identify this Linux distribution.' >&2; exit 1; fi
# shellcheck disable=SC1091
. /etc/os-release
if [[ ${ID:-} != ubuntu || ${VERSION_ID:-} != 24.04 ]]; then
  echo "This tested installer targets Ubuntu Server 24.04; detected ${PRETTY_NAME:-unknown}. Review packages and paths before adapting it." >&2
  exit 1
fi
if [[ $(uname -m) != x86_64 ]]; then echo 'Windows x64 guest profile currently requires an x86_64 host.' >&2; exit 1; fi
if [[ ! -e /dev/kvm ]]; then
  cat >&2 <<'MSG'
No /dev/kvm device exists. Enable Intel VT-x/AMD-V in firmware and expose KVM to this machine,
or use a supported bare-metal/virtual host with nested virtualization. NetLab's production UI
is static and cannot create this KVM device for you. No VM will be booted by this script.
MSG
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_SRC="$ROOT_DIR/runtime-backend"
if [[ ! -f "$RUNTIME_SRC/server.mjs" || ! -f "$RUNTIME_SRC/package.json" ]]; then
  echo 'Run this script from the extracted NetLab Studio source tree; runtime-backend/server.mjs was not found.' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg openssl \
  qemu-kvm qemu-utils libvirt-daemon-system libvirt-clients ovmf swtpm swtpm-tools \
  tcpdump caddy acl libcap2-bin

# Node.js 22 LTS repository, installed from its signed APT repository (not curl | bash).
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
chmod 0644 /etc/apt/keyrings/nodesource.gpg
cat > /etc/apt/sources.list.d/nodesource.list <<'APT'
deb [arch=amd64 signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main
APT
apt-get update
apt-get install -y --no-install-recommends nodejs

systemctl enable --now libvirtd
if ! virsh -c qemu:///system net-info default >/dev/null 2>&1; then
  DEFAULT_NET=/usr/share/libvirt/networks/default.xml
  [[ -f "$DEFAULT_NET" ]] || { echo 'Libvirt default network XML not found. Configure an isolated lab network manually before continuing.' >&2; exit 1; }
  virsh -c qemu:///system net-define "$DEFAULT_NET"
fi
virsh -c qemu:///system net-autostart default
virsh -c qemu:///system net-start default >/dev/null 2>&1 || true

# Service identity. Its access is limited to libvirt's management group and the
# paths declared in the systemd unit; no host shell or Docker socket is exposed.
getent group netlab-runtime >/dev/null || groupadd --system netlab-runtime
id -u netlab-runtime >/dev/null 2>&1 || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin --gid netlab-runtime netlab-runtime
for group in libvirt kvm libvirt-qemu; do getent group "$group" >/dev/null && usermod -aG "$group" netlab-runtime || true; done

install -d -o root -g libvirt-qemu -m 2750 /var/lib/libvirt/images/netlab-base
install -d -o root -g libvirt-qemu -m 2770 /var/lib/libvirt/images/netlab-vms
install -d -o root -g netlab-runtime -m 0750 /var/lib/netlab/state /var/lib/netlab/captures
install -d -o root -g netlab-runtime -m 0750 /etc/netlab
install -d -o root -g root -m 0755 /opt/netlab
rm -rf /opt/netlab/runtime-backend
install -d -o root -g root -m 0755 /opt/netlab/runtime-backend
cp -a "$RUNTIME_SRC/." /opt/netlab/runtime-backend/
chown -R root:root /opt/netlab/runtime-backend
# Create a valid empty registry before npm's verified source overlay can refresh this script.
# This prevents first-boot setup from depending on any stale copy of the installer block.
if [[ ! -f /etc/netlab/image-registry.json ]]; then
  printf '%s\\n' '{' '  "images": []' '}' > /etc/netlab/image-registry.json
  chown root:netlab-runtime /etc/netlab/image-registry.json
  chmod 0640 /etc/netlab/image-registry.json
fi

cd /opt/netlab/runtime-backend
npm install --omit=dev --no-audit --no-fund

if [[ ! -f /etc/netlab/image-registry.json ]]; then
  # Start empty so health/capability APIs work before an owner supplies guest media.
  printf '{\\n  "images": []\\n}\\n' > /etc/netlab/image-registry.json
  chown root:netlab-runtime /etc/netlab/image-registry.json
  chmod 0640 /etc/netlab/image-registry.json
fi
if [[ ! -f /etc/netlab/runtime.env ]]; then
  install -o root -g root -m 0600 "$RUNTIME_SRC/.env.example" /etc/netlab/runtime.env
  TOKEN="$(openssl rand -hex 32)"
  sed -i "s/^NETLAB_API_TOKEN=.*/NETLAB_API_TOKEN=$TOKEN/" /etc/netlab/runtime.env
fi
chown root:root /etc/netlab/runtime.env
chmod 0600 /etc/netlab/runtime.env
install -o root -g root -m 0644 "$RUNTIME_SRC/deploy/netlab-kvm-runtime.service" /etc/systemd/system/netlab-kvm-runtime.service
# tcpdump is invoked with fixed binary/arguments and the server allowlists interfaces.
# File capabilities avoid granting the entire Node service CAP_NET_RAW/CAP_NET_ADMIN.
setcap cap_net_raw,cap_net_admin=eip /usr/bin/tcpdump
systemctl daemon-reload
systemctl enable netlab-kvm-runtime

cat <<'NEXT'

Dependencies and the NetLab runtime service are installed, but the service is NOT started
until you edit /etc/netlab/runtime.env and /etc/netlab/image-registry.json.

1. Set NETLAB_PUBLIC_BASE_URL to your HTTPS API origin and add both that exact origin and
   https://netlab-studio-hazel.vercel.app to NETLAB_ALLOWED_ORIGINS.
2. Review network/capture allowlists in /etc/netlab/runtime.env. Do not add a physical NIC.
3. Put an OS image you are authorized to use in /var/lib/libvirt/images/netlab-base/.
4. Edit /etc/netlab/image-registry.json so every path is an absolute path inside that directory.
   Windows 11 installer entries must use mediaType=installer-iso, format=iso,
   firmware=uefi-secure-tpm2 and guestOS=Windows 11. Keep the ISO filename simple (no spaces).
5. Install a TLS reverse proxy using deploy/Caddyfile.example and a DNS name you control.
6. Start and inspect the service: systemctl start netlab-kvm-runtime; systemctl status netlab-kvm-runtime.
   Health check is https://YOUR-DOMAIN/api/health. Connect from Virtualization → QEMU/KVM backend.

Windows installation makes a new blank 80-GiB QCOW2 system disk (choose 80 GiB or more),
attaches your ISO as a read-only SATA CD-ROM, uses the SATA disk and e1000e NIC for installer
compatibility, and exposes the screen in the real noVNC console. Install Windows interactively,
shut down or eject the ISO after setup. Windows licensing/activation and the installation ISO
must be provided by you. No proprietary or licensed OS image is bundled here.
NEXT
