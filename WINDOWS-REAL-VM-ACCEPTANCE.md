# Real Windows VM — deployment and acceptance checklist

This checklist distinguishes the simulated topology node from a real guest operating system. A VM is not considered complete just because the browser marks its node as running. The NG Labs-style workflow also requires the cables drawn on the canvas to match real isolated Layer-2 links on the VM host.

## A. Website and runtime boundary

- NetLab Studio is the topology editor and a client for the VM API. The static website cannot boot an OS.
- `runtime-backend/` runs separately on an operator-managed Linux/KVM host.
- Run the read-only checks with `sudo bash runtime-backend/scripts/preflight-ubuntu-kvm.sh`.
- Install with `sudo bash runtime-backend/scripts/install-ubuntu.sh`. The installer refuses unsupported OS/architecture or a missing `/dev/kvm`. It never downloads Windows media.
- Keep the API bound to loopback behind a trusted HTTPS reverse proxy; never expose port 8787 directly to the Internet.

## B. Host, image and service setup

1. Provision dedicated Ubuntu Server 24.04 x86_64 with Intel VT-x/AMD-V enabled, working `/dev/kvm`, OVMF Secure Boot firmware, `swtpm` TPM 2.0 and sufficient RAM/storage. 12 GiB RAM and 100 GiB free storage are recommended for one 8-GiB/80-GiB guest plus host overhead.
2. Review `/etc/netlab/runtime.env`: use a unique long random bearer token, the public HTTPS origin, exact browser origin allowlist, and administrator-reviewed libvirt network/capture allowlists.
3. Put a Windows ISO that you are licensed and authorized to use inside `/var/lib/libvirt/images/netlab-base/`. Register it under `/etc/netlab/image-registry.json` as `id: windows11-installer`, `mediaType: installer-iso`, `format: iso`, `firmware: uefi-secure-tpm2`, `guestOS: Windows 11`. Do not point the registry outside the image root.
4. Configure DNS/TLS with `runtime-backend/deploy/Caddyfile.example`. Validate the final hostname and CORS settings before starting `netlab-kvm-runtime`.
5. Verify `https://YOUR-HOSTNAME/api/health`, then connect from **Virtualization → Connect QEMU/KVM backend…** using the HTTPS origin and server token.

## C. Windows install and actual-PC acceptance

1. Add a Windows VM node. Use 2+ vCPUs, 8192 MiB RAM and an 80 GiB disk as a recommended personal/lab profile; the secure Windows 11 profile enforces at least 2 vCPUs, 4096 MiB RAM and a 64 GiB disk.
2. Enter the registered ISO image ID and one or more network IDs reported by backend status. Only administrator-allowlisted networks are accepted.
3. Connect the guest ports with the intended canvas links. The backend creates isolated per-lab bridge segments; nodes connected through a switch/cloud segment share an L2 network. Synchronize the topology before creating VMs. Topology edits are locked while VMs exist; stop/delete/recreate guests after rewiring.
4. Start the VM and open its live noVNC console. The backend creates a persistent writable QCOW2 system disk, attaches the ISO read-only as a SATA CD-ROM, and uses the installer-compatible e1000e NIC.
5. Complete Windows Setup interactively on that console. A `running` response only means QEMU/libvirt reports the VM process running; it does not prove Windows has booted.
6. Observe the actual Windows sign-in screen and desktop. Test mouse, keyboard, display resize, app launch, normal shutdown/restart and file persistence after stop/start.
7. Eject the ISO after setup, if appropriate. Test DHCP, DNS and internet access through the approved virtual network.
8. Only mark PASS after the live Windows desktop, console interaction, persistence and networking are observed on the target host.

## D. Acceptance gate

- [ ] `/dev/kvm` exists, and libvirt returns host capabilities.
- [ ] Secure Boot OVMF and `swtpm` TPM 2.0 capabilities are detected.
- [ ] HTTPS health check, bearer-token auth and origin rejection behave correctly.
- [ ] Image registry path/symlink escape tests pass.
- [ ] VM creation creates a persistent writable guest disk with intended firmware and NIC profile.
- [ ] Canvas cables/switches/clouds map to the intended isolated libvirt L2 segment(s); no unintended host/Internet connectivity exists.
- [ ] The live noVNC console shows firmware/Windows installer; Windows actually reaches sign-in/desktop.
- [ ] Keyboard/mouse input works and data persists after a normal stop/start.
- [ ] Guest DHCP/DNS/internet work as intended.
- [ ] A running VM cannot be deleted; shutdown is graceful and server state is authoritative.
- [ ] Real packet capture is enabled only when host capability is present and the interface is allowlisted.

## Explicit limitations

- Canvas cables now map to isolated per-lab libvirt bridge segments. Topology updates require VM recreation and do not provide host/Internet access by default.
- Simulated traces are not real frames or PCAP. The PCAP endpoint captures only on configured host interfaces.
- This is currently an operator-managed bearer-token training runtime, not a multi-tenant service with per-user authorization and quotas.
- No Windows ISO, activation key, host, or cloud VM is bundled. A no-KVM development environment cannot prove Windows has booted.
