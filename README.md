# NetLab Studio v4.1 — CCNA labs + real Windows VM workflow

NG-Lab/EVE-NG-inspired browser topology and guided learning workspace. It is an educational simulator, not a complete EVE-NG replacement or a Cisco IOS emulator.

## v4.1 capabilities
- Browser workflow for connecting to an operator-managed QEMU/KVM API over HTTPS with a private API token.
- Admin-allowlisted image/network discovery, VM create/start/stop/status, short-lived noVNC console tickets and Windows installer-media eject flow.
- Windows installer profile uses owner-supplied authorized ISO media, a new writable QCOW2 disk, a read-only SATA CD-ROM and an e1000e NIC. Windows 11 requires compatible host UEFI Secure Boot and TPM 2.0.
- In-app roadmap for all 18 lesson titles in the supplied CCNA BootCamp Tamil course index. See `PLAYLIST-COVERAGE.md`.

## Important: a separate VM host is required
The Vercel website is static; it cannot itself run QEMU, access `/dev/kvm`, or boot Windows. Real guests require a separate x86_64 Linux host with Intel VT-x/AMD-V, QEMU/KVM, libvirt, OVMF and (for Windows 11) swtpm. Put it behind HTTPS with a strict origin and image/network allowlists. Supply only OS media and appliance images you are authorized to use.

The GitHub `main` branch now includes `runtime-backend/`, the host installer/preflight, systemd/Caddy examples and automated runtime tests. Start with [`WINDOWS-VM-QUICKSTART.md`](WINDOWS-VM-QUICKSTART.md), review [`VIRTUALIZATION-BACKEND.md`](VIRTUALIZATION-BACKEND.md), and use [`WINDOWS-REAL-VM-ACCEPTANCE.md`](WINDOWS-REAL-VM-ACCEPTANCE.md) for the on-host pass/fail checklist.

## Runtime honesty
No Windows ISO or proprietary appliance image is bundled. A real Windows guest has **not** been boot-certified because the development environment has no KVM host. The simulator's topology is not automatically bridged to arbitrary host networks, and simulated traces are not real PCAPs. Real host packet capture is available only after an appropriately configured backend is connected.

## Build and test
To rebuild the static release bundle from this repository:

```bash
node build.js
```

To verify the committed runtime backend:

```bash
cd runtime-backend
npm install
npm run check
npm test
```

GitHub Actions verifies the committed website bundle and runs the runtime API, image-registry, VM XML and console-ticket tests. The runtime test suite currently has 19 automated tests; these tests exercise API/VM-definition logic without requiring KVM and do not prove Windows has reached the desktop.

The complete editable source package has also passed 52 network/catalogue tests, 17 existing VM profile/lifecycle tests, 25 browser E2E tests, 22 bundled browser E2E tests, 19 runtime-backend tests, syntax checks and its production build. Test counts refer to the tested source package; do not infer real KVM guest boot from them.

## Playlist coverage
See `PLAYLIST-COVERAGE.md`. The published course index lists 18 lessons and 18:23:51 total. Full transcripts for all individual YouTube videos were not retrievable in this environment, so the roadmap is not a claim that every full video was watched end-to-end.
