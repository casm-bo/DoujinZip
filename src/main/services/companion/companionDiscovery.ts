import { Bonjour } from "bonjour-service";
import { execFile } from "child_process";
import { promisify } from "util";
import { networkInterfaces, type NetworkInterfaceInfo } from "os";

interface Adapter {
  Name: string;
  NdisPhysicalMedium: number;
}
export function rankDiscoveryAddresses(
  interfaces: ReturnType<typeof networkInterfaces>,
  adapters: Adapter[],
): string[] {
  const ranked = adapters
    .flatMap((adapter) =>
      (interfaces[adapter.Name] ?? [])
        .filter(
          (entry: NetworkInterfaceInfo) =>
            entry.family === "IPv4" &&
            !entry.internal &&
            /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(
              entry.address,
            ),
        )
        .map((entry) => ({
          address: entry.address,
          rank:
            adapter.NdisPhysicalMedium === 9 || adapter.NdisPhysicalMedium === 1
              ? 1
              : 0,
        })),
    )
    .sort((a, b) => a.rank - b.rank || a.address.localeCompare(b.address));
  return [...new Set(ranked.map((entry) => entry.address))];
}
export async function getDiscoveryAddresses(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await promisify(execFile)(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-NetAdapter -Physical | Select-Object Name,NdisPhysicalMedium | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 5000 },
    );
    const parsed = JSON.parse(stdout || "[]");
    return rankDiscoveryAddresses(
      networkInterfaces(),
      Array.isArray(parsed) ? parsed : [parsed],
    );
  } catch {
    return [];
  }
}
export class CompanionDiscovery {
  private bonjours: Bonjour[] = [];
  private generation = 0;
  async start(id: string, name: string, port: number) {
    this.stop();
    const generation = this.generation;
    const addresses = await getDiscoveryAddresses();
    if (generation !== this.generation) return;
    for (const [index, address] of (addresses.length
      ? addresses
      : [undefined]
    ).entries()) {
      try {
        // Windows may route default multicast through a virtual adapter.
        const bonjour = new Bonjour(
          // bonjour-service forwards these options to multicast-dns but mistypes them as ServiceConfig.
          (address
            ? { interface: address, bind: "0.0.0.0" }
            : {}) as ConstructorParameters<typeof Bonjour>[0],
          (error: Error) =>
            console.warn("Companion discovery unavailable", error.message),
        );
        this.bonjours.push(bonjour);
        const service = bonjour.publish({
          name: `DoujinZip ${name} ${id.slice(0, 8)} ${index}`,
          type: "doujinzip",
          protocol: "tcp",
          port,
          disableIPv6: true,
          txt: { id, name, addresses: JSON.stringify(addresses.slice(0, 8)) },
        });
        service.on("error", (error: Error) =>
          console.warn("Companion discovery unavailable", error),
        );
      } catch (error) {
        console.warn("Companion discovery unavailable", error);
      }
    }
  }
  stop() {
    this.generation++;
    const bonjours = this.bonjours;
    this.bonjours = [];
    for (const bonjour of bonjours)
      bonjour.unpublishAll(() => bonjour.destroy());
  }
}
