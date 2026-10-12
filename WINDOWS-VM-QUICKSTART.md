# Real Windows VM quick-start

## The two required components

- **NetLab Studio website:** topology editor and a client for the VM API.
- **VM host:** a separate operator-managed x86_64 Linux machine running QEMU/KVM/libvirt. Vercel cannot create `/dev/kvm` or boot a Windows guest.

No Windows ISO, activation key or proprietary network appliance image is bundled. Use installation media and licenses you are authorized to use.

## Dedicated Ubuntu VM host

1. Provision Ubuntu Server 24.04 x86_64 with Intel VT-x/AMD-V enabled and confirm `test -c /dev/kvm` succeeds. A physical or supported nested-virtualization host can be used.
2. Extract the full source package on the host.
3. Run read-only preflight: `sudo bash runtime-backend/scripts/preflight-ubuntu-kvm.sh`.
4. Install packages and the service: `sudo bash runtime-backend/scripts/install-ubuntu.sh`. The installer stops if Ubuntu 24.04, x86_64 or `/dev/kvm` requirements are not met. It does not download guest OS images.
5. Review `/etc/netlab/runtime.env` and `/etc/netlab/image-registry.json`. Use a unique long token, keep `NETLAB_BIND_HOST=127.0.0.1`, set exact HTTPS origins, and allowlist only the virtual networks and capture interfaces the host administrator approves.
6. Put a Windows ISO you are licensed to use under `/var/lib/libvirt/images/netlab-base/` and register it in `/etc/netlab/image-registry.json`: `id: windows11-installer`, `mediaType: installer-iso`, `format: iso`, `firmware: uefi-secure-tpm2`, `guestOS: Windows 11`. Review file path and permissions.
7. Configure DNS/TLS using `runtime-backend/deploy/Caddyfile.example`. Do not expose port 8787 directly to the Internet. Edit the actual hostname/origins in `/etc/netlab/runtime.env` before service startup.
8. Start the service only after configuration review: `sudo systemctl start netlab-kvm-runtime`; check `sudo systemctl status netlab-kvm-runtime` and `https://YOUR-HOSTNAME/api/health`.
9. In NetLab Studio open **Virtualization → Connect QEMU/KVM backend…**. Enter the HTTPS API origin and server token, then refresh backend status/images.
10. Set a Windows VM profile with at least 2 vCPUs, 4096 MiB RAM, 64 GiB disk (8 GiB RAM / 80 GiB disk recommended). Set the authorized ISO ID and network IDs. Start the VM, open its real noVNC console and complete Windows Setup interactively.

## Important limitations

- Hypervisor `running` means the VM process is running; it does not prove Windows has reached the desktop. Inspect the actual console.
- Test mouse/keyboard, display resize, Windows sign-in, file persistence after stop/start, DHCP/DNS/internet and ISO ejection on the actual host before saying the VM works.
- Real Windows boot cannot be tested in an environment without `/dev/kvm` and a licensed Windows ISO.
- The canvas topology does not automatically connect every drawn cable to Linux TAP/bridge links. Only administrator-allowlisted libvirt networks can be attached.
- Browser-simulated packet traces are not real PCAP. The real capture path depends on the backend and allowlisted host interface.
- Never expose host SSH, Docker socket, libvirt socket, QEMU monitor or arbitrary filesystem paths to the browser.
