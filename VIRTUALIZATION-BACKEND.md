# Real VM runtime — NetLab Studio v4.1

## Important packaging status
The browser UI and its production build are in this GitHub repository. The complete `runtime-backend/` implementation, installer script, service unit, image registry example and backend tests are in the v4.1 source ZIP supplied in the ChatGPT conversation, but are not all committed into this repository tree yet. A fresh GitHub checkout alone cannot install the backend. Use the supplied ZIP's `runtime-backend/` directory.

## Deployment boundary
The Vercel app is a static browser application. It cannot run QEMU, access `/dev/kvm`, or host a Windows desktop itself. A separate operator-managed Linux/KVM host runs `runtime-backend/server.mjs`. The browser connects to this service over HTTPS using a secret held in the current browser session; it is not exported with project files.

## Windows installer workflow
1. Prepare a dedicated x86_64 Ubuntu Server 24.04 KVM host. Enable Intel VT-x/AMD-V in firmware and verify `/dev/kvm` exists.
2. Extract the v4.1 source ZIP and run `sudo runtime-backend/scripts/install-ubuntu.sh` on the dedicated host. The script checks the host and does not download Windows images.
3. Review `/etc/netlab/runtime.env`; configure a long random API token, public HTTPS base URL, exact allowed browser origins, and conservative network/capture allowlists. Keep the service private behind TLS; do not forward port 8787 directly to the public internet.
4. Put an installer ISO you are authorized to use under `/var/lib/libvirt/images/netlab-base/` and register it in `/etc/netlab/image-registry.json` as an allowlisted `installer-iso`. Do not expose arbitrary filesystem paths.
5. Configure the Caddy reverse proxy from `runtime-backend/deploy/Caddyfile.example`, verify TLS, then start `netlab-kvm-runtime` and test `/api/health`.
6. In the website, choose Virtualization → Connect QEMU/KVM backend, enter the HTTPS origin and token, refresh capabilities/images, and create a Windows VM with the ISO image ID.
7. The backend creates a blank QCOW2 disk and attaches the authorized ISO read-only. Complete Windows setup in the live console; eject the ISO after installation. Windows 11 launch is rejected unless Secure Boot and TPM 2.0 are available.
8. Confirm the VM state from backend status and inspect the console. An accepted API request or running QEMU process does not prove that Windows completed booting.

## Security controls
- Bearer token, strict allowed-origin handling, bounded request schema, server-side image registry, path and symlink escape rejection.
- Only predefined libvirt operations and registered image/network IDs are accepted; browser input is never passed to a host shell.
- Host service binds to loopback behind TLS proxy, with dedicated service user and systemd filesystem restrictions. Review and adapt the installer/service before production.
- Short-lived, single-use noVNC tickets; PCAP capture only on pre-allowlisted interfaces with duration/size bounds.
- Do not expose host SSH, Docker socket, raw QEMU monitor, libvirt socket, physical interfaces, arbitrary image paths or captures to the browser.

## Known limitations
- No KVM host exists in the build environment, so a real guest boot has not been tested here.
- No Windows ISO or vendor appliance image is bundled; supply only media you have rights to use and follow licensing/activation requirements.
- The network canvas is not yet automatically projected to isolated Linux TAP/bridge networks.
- Real Windows boot and noVNC require successful host setup; PCAP requires host tcpdump privileges and allowlisted capture interfaces.
- Current simulated packet traces are not actual packets; real captures are only from configured backend endpoints.
