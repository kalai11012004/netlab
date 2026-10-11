# Real virtualization backend — architecture proposal

## Current v4.0 behavior

NetLab Studio is a static browser application. VM, appliance, container, and network-cloud objects are project profiles processed by a simulated network model. Start/Stop is only simulated state. The app does not boot guest OS images, execute QEMU/KVM/Docker, expose real SSH/VNC, bridge a host NIC, or capture real packets.

## Recommended architecture

Browser UI → HTTPS, identity and permissions → Lab API (schema/quota checks and audit log) → isolated lab scheduler/controller → QEMU/KVM worker pool, optional OCI worker, per-lab virtual L2 networks, authenticated console gateway, and optional packet-capture worker.

## Minimum safe sequence

1. Implement authenticated API actions for create/start/stop/wipe/delete, node status, vNIC attach/detach, console ticket and logs.
2. Enforce per-user/per-lab isolation, resource limits, rate limits, audit logs, idempotency, timeouts and guaranteed cleanup.
3. Maintain a server-side image registry with format validation, hashes, supported versions and licensing/authorization metadata.
4. Use server-authoritative states (defined, queued, starting, running, stopping, stopped, failed). Only show running after hypervisor confirmation.
5. Add virtual network isolation and cross-lab isolation tests before enabling any external bridge or NAT.
6. Use a scoped, expiring console proxy; do not expose raw hypervisor sockets, Docker socket, host SSH or arbitrary filesystem access.
7. Add snapshots, rollback policy, monitoring, storage limits and cleanup after errors/timeouts.
8. Add PCAP/remote Wireshark only when packets traverse the real backend.

Users must supply images they are legally authorized to use. Do not bundle proprietary vendor images into the public repository.
