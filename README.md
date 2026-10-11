# NetLab Studio v4.1 — CCNA labs + Windows VM runtime

NG-Lab/EVE-NG-inspired browser topology and guided learning workspace with an optional real-host QEMU/KVM API. It is an educational simulator, not a complete EVE-NG replacement or a Cisco IOS emulator.

## v4.1
- Connect the browser to an operator-managed QEMU/KVM backend over HTTPS using a private API token.
- Discover admin-allowlisted VM images/networks; request real VM create/start/stop/status and open an expiring noVNC console ticket.
- Windows installer workflow: authorized ISO, new writable QCOW2 disk, read-only SATA CD-ROM, SATA disk and e1000e NIC. Windows 11 requires host UEFI Secure Boot and TPM 2.0 capability.
- Added an in-app road map matching all 18 topics from the provided CCNA BootCamp Tamil course index. See `PLAYLIST-COVERAGE.md`.
- Added an Ubuntu Server 24.04 installation script, restricted systemd service and reverse-proxy example under `runtime-backend/`.

## Real Windows guest — requirements
The Vercel site is static and is **not** itself a hypervisor. To boot Windows, use a dedicated x86_64 Linux host with Intel VT-x/AMD-V, working `/dev/kvm`, QEMU/KVM, libvirt, OVMF and swtpm. Extract the source ZIP, run `sudo runtime-backend/scripts/install-ubuntu.sh` on that dedicated Ubuntu Server 24.04 host, review `/etc/netlab/runtime.env` and `/etc/netlab/image-registry.json`, configure HTTPS, then connect from **Virtualization → Connect QEMU/KVM backend…**. Register only an OS ISO/image you are legally authorized to use. See `VIRTUALIZATION-BACKEND.md` for the checklist.

**Runtime honesty:** no OS ISO or proprietary appliance image is bundled. The VM flow is not operational until a separate host is installed and connected. This repository's CI/test environment has no `/dev/kvm`, so no real Windows guest boot has been certified here. The simulator's current topology is not automatically bridged to host networks, and simulated CSV traces are not real PCAPs.

## Run the browser UI locally
With Node.js installed, run `node build-local.js` and serve the project with `python -m http.server 8080`; open `http://localhost:8080`. Stop the server with Ctrl+C.

## Validation
- Network engine, security, regression and catalogue tests: 52 passing.
- Browser E2E tests: 24 passing.
- Bundled application E2E tests: 22 passing.
- QEMU/KVM runtime API / image registry / libvirt XML unit tests: 17 passing.
These tests validate application and API logic. They do not substitute for a real KVM host or a live Windows-install verification.

## Playlist coverage
The linked course page lists 18 lessons / 18:23:51 total. See `PLAYLIST-COVERAGE.md` for a lesson-by-lesson implementation gap map. The individual YouTube transcripts could not all be retrieved in this environment; the coverage map does not claim every full video was watched.
