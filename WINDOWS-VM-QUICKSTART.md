# NG Labs-style real VM and topology quick-start

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
10. In the workspace, select a PC/server/router/firewall and choose **Enable real QEMU/KVM profile**. Choose an image ID from the administrator registry; Windows needs a licensed installer ISO, while a router/firewall needs a compatible admin-supplied image.
11. Draw the links first. The runtime syncs the canvas into isolated per-lab Layer-2 bridge segments: nodes attached through a switch/cloud segment share that segment, and direct cables create their own segment. No host/Internet egress is granted by default.
12. Set a Windows profile with at least 2 vCPUs, 4096 MiB RAM and 64 GiB disk (8 GiB RAM / 80 GiB disk recommended). Start the guest, open the real noVNC console and complete Windows Setup interactively. Router/firewall profiles use a real serial console only when the registered guest image supports it.
13. Topology changes are locked while VMs exist; stop/delete/recreate affected guests after changing cables so the hypervisor wiring matches the canvas.

## Important limitations

- Hypervisor `running` means the VM process is running; it does not prove Windows has reached the desktop. Inspect the actual console.
- Test mouse/keyboard, display resize, Windows sign-in, file persistence after stop/start, DHCP/DNS/internet and ISO ejection on the actual host before saying the VM works.
- Real Windows boot cannot be tested in an environment without `/dev/kvm` and a licensed Windows ISO.
- Canvas links now map to isolated per-lab libvirt bridge segments. These are not connected to physical NICs or the Internet by default; explicitly design and review any required gateway/NAT.
- Browser-simulated packet traces are not real PCAP. The real capture path depends on the backend and allowlisted host interface.
- Never expose host SSH, Docker socket, libvirt socket, QEMU monitor or arbitrary filesystem paths to the browser.
