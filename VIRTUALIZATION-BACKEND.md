# Real VM runtime — NetLab Studio v4.1

## Deployment boundary
The Vercel app is a static browser application. It cannot run QEMU, access `/dev/kvm`, or host a Windows desktop itself. A separate operator-managed Linux/KVM host runs `runtime-backend/server.mjs`. The browser can connect to this service over HTTPS using a secret kept in the current browser session; it is not exported with project files.

## Windows installer workflow
1. Prepare a dedicated x86_64 Ubuntu Server 24.04 KVM host. Enable Intel VT-x/AMD-V in firmware and verify `/dev/kvm` exists.
2. Extract the source ZIP and run `sudo runtime-backend/scripts/install-ubuntu.sh` on the host. The script checks the host and does not download Windows images.
3. Review `/etc/netlab/runtime.env`; configure a long random API token, public HTTPS base URL, exact allowed browser origins, and conservative network/capture allowlists. Keep the service private behind TLS; do not forward port 8787 directly to the public internet.
4. Put an installer ISO you are authorized to use under `/var/lib/libvirt/images/netlab-base/` and register it in `/etc/netlab/image-registry.json` as an allowlisted `installer-iso`. Do not expose arbitrary filesystem paths.
5. Configure the Caddy reverse proxy from `runtime-backend/deploy/Caddyfile.example`, verify TLS, then start `netlab-kvm-runtime` and test `/api/health`.
6. In the website, choose Virtualization → Connect QEMU/KVM backend, enter the HTTPS origin and token, refresh capabilities/images, and create a Windows VM with the ISO image ID.
7. The backend creates a blank QCOW2 disk and read-only SATA CD-ROM, uses a SATA disk and e1000e NIC for installer compatibility, then issues an expiring console ticket for noVNC. Complete Windows setup interactively; eject the ISO after install. Windows 11 launch is rejected unless UEFI Secure Boot and TPM 2.0 are available.
8. Confirm the real VM state from backend status and inspect the console. Do not infer guest readiness from an accepted API request or the presence of a QEMU process.

## Security controls
- Bearer token, strict allowed-origin handling, bounded request schema, server-side image registry, path and symlink escape rejection.
- Only predefined libvirt operations and registered image/network IDs are accepted; browser input is never passed to a host shell.
- Host service binds to loopback behind TLS proxy, with dedicated service user and systemd filesystem restrictions. Review and adapt the installer/service before production.
- Short-lived, single-use noVNC tickets; PCAP capture only on pre-allowlisted interfaces with duration/size bounds.
- Do not expose host SSH, Docker socket, raw QEMU monitor, libvirt socket, physical interfaces, arbitrary image paths or captures to the browser.

## Known limitations
- No QEMU/KVM host exists in the build environment, so the real guest boot has not been tested here. The API/unit tests are not a substitute for an integration test on the target server.
- No Windows ISO or vendor appliance image is bundled. Supply only images you have rights to use and follow their licensing/activation requirements.
- The network canvas is not yet automatically projected to isolated Linux TAP/bridge networks. Registered libvirt network attachment is supported only as selected by the backend's network allowlist.
- Real Windows boot and noVNC require successful host setup; PCAP requires host tcpdump privileges and allowlisted capture interfaces.
- Current simulated packet traces are not actual packets. Real captures are only from configured backend endpoints.
