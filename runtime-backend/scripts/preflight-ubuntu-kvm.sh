#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only preflight for the separate, dedicated NetLab KVM host.
# It does not install packages, start services, alter networks, or boot guests.

failures=0
warnings=0
pass() { printf '  [PASS] %s\n' "$*"; }
warn() { printf '  [WARN] %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf '  [FAIL] %s\n' "$*"; failures=$((failures + 1)); }
section() { printf '\n%s\n' "$*"; }

section 'NetLab Studio — Ubuntu KVM host preflight (read-only)'
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  if [[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]]; then pass "Ubuntu ${VERSION_ID}"; else fail "Expected Ubuntu Server 24.04; detected ${PRETTY_NAME:-unknown}"; fi
else
  fail 'Cannot read /etc/os-release'
fi
[[ "$(uname -m)" == x86_64 ]] && pass 'x86_64 host architecture' || fail "Expected x86_64; detected $(uname -m)"
[[ -c /dev/kvm ]] && pass '/dev/kvm exists and is a character device' || fail '/dev/kvm is missing; enable VT-x/AMD-V and KVM/nested virtualization'

section 'Required executables'
for cmd in virsh qemu-system-x86_64 qemu-img swtpm tcpdump node npm curl; do
  if command -v "$cmd" >/dev/null 2>&1; then pass "$cmd → $(command -v "$cmd")"; else fail "$cmd is not installed"; fi
done
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  (( node_major >= 22 )) && pass "Node.js $(node --version)" || fail "Node.js 22 or newer is required (found $(node --version))"
fi

section 'Hypervisor service and virtual network'
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet libvirtd; then pass 'libvirtd service is active'; else fail 'libvirtd is not active'; fi
if command -v virsh >/dev/null 2>&1; then
  if virsh -c qemu:///system capabilities >/dev/null 2>&1; then pass 'libvirt system connection responds'; else fail 'Cannot query qemu:///system; check libvirt and service identity permissions'; fi
  if virsh -c qemu:///system net-info default >/dev/null 2>&1; then
    net_state="$(virsh -c qemu:///system net-info default 2>/dev/null | awk -F: '/^Active:/ {gsub(/[[:space:]]/,"",$2); print $2}')"
    [[ "$net_state" == yes ]] && pass 'libvirt default network is active' || fail 'libvirt default network exists but is not active'
  else
    fail 'libvirt default network is missing; define an administrator-reviewed NAT/isolated network'
  fi
fi

section 'Windows 11 Secure Boot / TPM capability files'
if [[ -d /usr/share/OVMF ]]; then
  secure_code="$(find /usr/share/OVMF -maxdepth 1 -type f \( -name 'OVMF_CODE_4M.ms.fd' -o -name 'OVMF_CODE.secboot.fd' -o -name 'OVMF_CODE_4M.secboot.fd' \) -print -quit)"
  secure_vars="$(find /usr/share/OVMF -maxdepth 1 -type f \( -name 'OVMF_VARS_4M.ms.fd' -o -name 'OVMF_VARS.secboot.fd' -o -name 'OVMF_VARS_4M.secboot.fd' \) -print -quit)"
  [[ -n "$secure_code" ]] && pass "Secure Boot OVMF code: $secure_code" || fail 'Secure Boot OVMF code file was not found under /usr/share/OVMF'
  [[ -n "$secure_vars" ]] && pass "Secure Boot OVMF variables: $secure_vars" || fail 'Secure Boot OVMF variables template was not found under /usr/share/OVMF'
else
  fail '/usr/share/OVMF is missing; install the ovmf package'
fi
if command -v swtpm >/dev/null 2>&1; then swtpm --version >/dev/null 2>&1 && pass 'swtpm executable responds' || warn 'swtpm exists but version query failed'; fi

section 'Resource snapshot'
if command -v free >/dev/null 2>&1; then
  mem_mib="$(awk '/MemTotal:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  if (( mem_mib >= 12288 )); then pass "Host RAM: ${mem_mib} MiB (comfortable for an 8-GiB Windows guest)"; else warn "Host RAM: ${mem_mib} MiB; 12 GiB or more is recommended for an 8-GiB guest plus host overhead"; fi
fi
root_avail_kib="$(df -Pk /var/lib 2>/dev/null | awk 'NR==2 {print $4}' || echo 0)"
root_avail_gib=$(( ${root_avail_kib:-0} / 1024 / 1024 ))
if (( root_avail_gib >= 100 )); then pass "Available storage under /var/lib: about ${root_avail_gib} GiB"; else warn "Available storage under /var/lib: about ${root_avail_gib} GiB; leave at least 100 GiB for an 80-GiB VM disk plus host data"; fi

section 'Summary'
printf 'Failures: %d · Warnings: %d\n' "$failures" "$warnings"
if (( failures > 0 )); then
  echo 'This host is NOT ready for the real Windows VM. Resolve all [FAIL] items and rerun this script.'
  exit 1
fi
if (( warnings > 0 )); then
  echo 'Core checks passed, but review the warnings before assigning a Windows VM.'
else
  echo 'Preflight passed. This verifies host prerequisites only; it does NOT prove Windows has booted.'
fi
