# NetLab Studio v4.1 — CCNA labs + Windows VM workflow

NG-Lab/EVE-NG-inspired browser topology and guided learning workspace. It is an educational simulator, not a complete EVE-NG replacement or a Cisco IOS emulator.

## v4.1
- Browser workflow for connecting to an operator-managed QEMU/KVM API over HTTPS with a private API token.
- Admin-allowlisted image/network discovery, VM create/start/stop/status, expiring noVNC console tickets and Windows installer-media eject flow.
- Windows installer profile uses an authorized ISO, a new writable QCOW2 disk, read-only SATA CD-ROM and e1000e NIC. Windows 11 requires host UEFI Secure Boot and TPM 2.0 capability.
- In-app road map for all 18 lesson titles in the supplied CCNA BootCamp Tamil course index. See `PLAYLIST-COVERAGE.md`.

## Important: separate VM server required
The Vercel website is static; it cannot itself run QEMU, access `/dev/kvm`, or boot Windows. Real guests require a separate x86_64 Linux host with Intel VT-x/AMD-V, QEMU/KVM, libvirt, OVMF and (for Windows 11) swtpm, plus HTTPS and strict host-side allowlists. Supply only OS media/images you are authorized to use.

**Repository packaging note:** the complete `runtime-backend/` implementation and Ubuntu installation files are included in the v4.1 source ZIP attached in this ChatGPT conversation. They are not all committed to the GitHub tree yet, so a fresh GitHub checkout alone is not sufficient to install the backend. Use the supplied source ZIP for the backend package; do not assume the paths mentioned in `VIRTUALIZATION-BACKEND.md` are present in this repository checkout.

## Runtime honesty
No Windows ISO or proprietary appliance image is bundled. A real Windows guest has not been boot-certified here because the build/test environment has no KVM host. The simulator's topology is not automatically bridged to host networks, and simulated traces are not real PCAPs. Real host packet capture is available only after a separately configured backend is connected.

## Browser app
The production site is https://netlab-studio-hazel.vercel.app. To rebuild the static app from this repository, use `node build.js`; the builder verifies payload checksums before output.

## Validation
- Network engine, regression, security and catalogue tests: 52 passing.
- Browser E2E tests: 24 passing.
- Bundled application E2E tests: 22 passing.
- QEMU/KVM API, image registry and libvirt XML unit tests: 17 passing.

These validate application/API logic, not a real KVM guest boot.

## Playlist coverage
See `PLAYLIST-COVERAGE.md`. The published course index lists 18 lessons and 18:23:51 total. Full transcripts for all individual YouTube videos were not retrievable in this environment, so the roadmap is not a claim that every full video was watched end-to-end.
