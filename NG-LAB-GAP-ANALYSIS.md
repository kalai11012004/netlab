# NG-Lab-style feature gap analysis — NetLab Studio 4.0

## Reference and limitations

Reference target: EVE-NG / NG-Lab-style lab workflow visible in the provided screenshot and public EVE-NG documentation. The complete video list/transcripts for the referenced YouTube playlist were not available here, so this is not a claim that every video was watched.

## Status matrix

| Area | v4.0 status | Detail |
|---|---|---|
| Topology canvas, node placement and port-to-port links | Implemented in browser model | Device/interface inventories and cable state |
| Context actions, node manager, configured objects | Implemented in browser model | Edit, duplicate/delete, simulated start/stop, connected-port view |
| Lab title/description/objectives and lock | Implemented in browser model | Local project state; no multi-user authorization |
| Startup configs and local file repository | Partial | Text templates/snippets only, not injected into a live guest |
| Virtual machine profiles | Partial | OS/image reference, vCPU/RAM/disk/vNICs, simulated lifecycle |
| Real guest OS boot, real console and VM process | Missing; backend required | Requires isolated QEMU/KVM/hypervisor service and authorized images |
| Container run-time | Missing; backend required | Container profile only; no Docker/OCI runtime connected |
| Virtual cloud/L2 segment | Implemented in packet model only | It does not attach to host/physical interfaces |
| IPv4, static routing, VLAN access/trunk, ARP/MAC/ICMP trace | Partial supported model | Suitable only for documented training scenarios |
| OSPF/BGP, STP/RSTP, DHCP/DNS, NAT/PAT, ACL dataplane, IPv6 | Missing or partial | Each requires protocol state, failure/convergence tests and CLI consistency |
| PCAP/Wireshark and real packet capture | Missing; backend required | Current export is simulated CSV trace only |
| PWA/offline | Partial | Static UI cache; VM/backend features do not work offline |

## Backend acceptance criteria

- Show Running only after the hypervisor confirms guest execution.
- Resolve image identifiers server-side; never trust arbitrary paths or user-supplied shell commands.
- Isolate labs, networks, console sessions and storage. Apply CPU/RAM/disk quotas, timeout and cleanup.
- Use authenticated, expiring console tickets; do not expose Docker socket, raw hypervisor monitor, host shell, or physical NIC directly.
- Test VM boot, console access, vNIC attachment, expected packet flow, cross-lab isolation, timeouts and cleanup.
