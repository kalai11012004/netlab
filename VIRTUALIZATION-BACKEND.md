# NetLab Studio v4.1 — Real Windows/Linux VM runtime

## Package and deployment boundary

The browser UI remains a static Vercel website. The `runtime-backend/` source in the repository is a separate authenticated Node.js API/driver for QEMU/KVM/libvirt. It cannot run inside Vercel functions and cannot create `/dev/kvm` for itself. A dedicated operator-managed Linux KVM host is required for a real Windows desktop.

## Verified capabilities in source and automated tests

- Read-only host preflight, guarded Ubuntu 24.04 x86_64 installer, systemd service and Caddy HTTPS reverse-proxy example.
- Authenticated APIs for hypervisor capability checks, authorized guest image listing, allowlisted network listing, VM creation/start/stop/delete, and guest state queries.
- Windows installer ISO flow that creates a persistent writable QCOW2 disk, attaches the owner-supplied ISO read-only, selects SATA storage/e1000e NIC for installer compatibility, and requests UEFI Secure Boot plus TPM 2.0.
- Short-lived, single-use console tickets and a noVNC browser console proxied to a loopback-only VNC display.
- Real PCAP collection only when tcpdump works and a host interface is explicitly allowlisted.
- Input validation, exact allowed browser origins, bearer-token auth, image-root and symlink checks, server-side network/image allowlists, resource limits, and no user-controlled shell command execution.

Automated tests exercise the API and generated VM XML with a fake driver. They do not replace integration testing on a real hypervisor host.

## Windows 11 deployment sequence

1. Provision a dedicated Ubuntu Server 24.04 x86_64 host with Intel VT-x/AMD-V enabled, `/dev/kvm`, at least 12 GiB RAM recommended, and at least 100 GiB free storage for an 80 GiB virtual disk plus host overhead.
2. Run the read-only preflight: `sudo bash runtime-backend/scripts/preflight-ubuntu-kvm.sh`.
3. Install packages and the service: `sudo bash runtime-backend/scripts/install-ubuntu.sh`. The installer refuses unsupported OS/architecture or a missing `/dev/kvm` and does not download guest operating systems.
4. Edit `/etc/netlab/runtime.env` and `/etc/netlab/image-registry.json`. Use a strong random API token, an HTTPS base URL, exact browser origins, and only administrator-reviewed libvirt network/capture IDs. Keep the API bound to `127.0.0.1`.
5. Place a Windows installer ISO you are licensed to use under `/var/lib/libvirt/images/netlab-base/`. Register it with ID `windows11-installer`, `mediaType: "installer-iso"`, `format: "iso"`, `firmware: "uefi-secure-tpm2"`, and `guestOS: "Windows 11"`.
6. Configure DNS/TLS with `runtime-backend/deploy/Caddyfile.example`, start the service only after configuration review, and verify `https://YOUR-HOSTNAME/api/health`.
7. In the website, choose Virtualization → Connect QEMU/KVM backend. Enter the API HTTPS origin and server token; refresh capabilities/images.
8. Add a Windows VM profile with at least 2 vCPUs, 4 GiB RAM and 64 GiB disk (8 GiB RAM / 80 GiB disk recommended). Choose an administrator-allowlisted network and the registered Windows ISO.
9. Start the VM and open the real noVNC console. Complete Windows Setup interactively, verify the sign-in screen/desktop, then eject the installation ISO when suitable. Follow Windows licensing and activation requirements.

A backend response of `running` means the hypervisor confirms the VM process is running. It does **not** prove Windows completed booting. The desktop must be observed in the live console.

## Security and operations

- Never expose TCP 8787 directly to the public internet; keep the backend bound to loopback behind a trusted TLS proxy.
- Never publish the runtime bearer token, `libvirt` socket, host SSH, raw QEMU monitor, Docker socket, arbitrary image paths or unrestricted host interfaces.
- The stock profile permits only configured libvirt network names. It does not expose direct physical NIC passthrough by default.
- The runtime is currently a single operator-managed bearer-token service intended for a controlled personal/training instance, not a multi-tenant hosted service with user accounts, user-scoped lab access or per-user quotas.
- No Windows ISO, activation key, licensed router/firewall appliance, or cloud hypervisor is bundled.

## Known limitations / acceptance blockers

- The development environment used for this build has no `/dev/kvm`, OVMF installation, running libvirt service, or enough free storage for a recommended Windows guest; no actual Windows guest boot was possible here.
- Windows reaching the desktop, real noVNC input/resize, persistence after stop/start, guest internet/DNS and host packet capture still require target-host acceptance tests.
- The topology canvas does not automatically project every drawn cable onto Linux TAP/bridge links. VMs attach only to administrator-allowlisted libvirt networks.
- Browser-simulated packet traces are not real network packets or PCAP. Real captures require the runtime to report PCAP capability and an approved host interface.
- Containers are not connected to Docker/OCI execution yet; router/firewall appliance profiles require separately licensed images and suitable runtimes.
