# Real Windows VM status — 2026-10-13

## Verified in the source package

- The root `npm test` suite passes: 52 network/catalogue tests, 17 existing VM-backend tests, 25 readable-source browser E2E tests and 22 bundled browser E2E tests. Separately, `runtime-backend/npm test` passes 19 runtime API/VM XML/image-registry/console-ticket tests.
- `npm run build` passes. Output HTML SHA-256: `4ea90d3d75fe143c069afca40b58f1f881627dda905abb6966b9b0574d141720`.
- Backend Node syntax checks and shell syntax checks pass. The dedicated console-ticket tests now cover stopped/running VM checks, short lifetime metadata and the noVNC console page.
- Windows installer profile creates a writable QCOW2 disk and attaches an owner-supplied ISO read-only. Windows 11 is gated on Secure Boot OVMF and software TPM 2.0.
- The source package contains a read-only host preflight, Ubuntu installer, systemd service, Caddy example and acceptance checklist.

## GitHub and deployment status

- Runtime backend source has been committed to branch `feature/real-windows-vm-runtime` in `kalai11012004/netlab`. It is not yet merged to `main`.
- The two GitHub Actions checks passed on the pull-request head before merge. Vercel deployment of the merged commit is not verified. In any case, a Vercel static deployment cannot run QEMU or provide `/dev/kvm`.
- A complete ZIP can be used as a self-contained source package; the target host must be provisioned and the backend must be installed separately.

## Not verified in this environment

- No `/dev/kvm`, running libvirt service or OVMF firmware is available here. A real guest boot was not possible.
- No Windows ISO or activation key is bundled. Supply installation media and valid licensing yourself.
- Actual Windows reaching desktop, live-console mouse/keyboard/resize, guest networking, persistence across stop/start and real host PCAP still require acceptance testing on the target host.
- The network canvas does not automatically project all drawn links to isolated Linux TAP/bridge networks. Containers and licensed router/firewall appliance runtimes are not integrated.
