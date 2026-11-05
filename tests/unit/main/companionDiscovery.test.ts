import { expect, it } from "vitest";
import { rankDiscoveryAddresses } from "../../../src/main/services/companion/companionDiscovery";
it("prefers physical Ethernet over Wi-Fi and excludes virtual adapters", () => {
  const entry = (address: string) => ({
    address,
    family: "IPv4",
    internal: false,
  });
  const interfaces = {
    Cable: [entry("192.168.10.2")],
    Radio: [entry("192.168.10.3")],
    Virtual: [entry("172.20.0.1")],
  };
  expect(
    rankDiscoveryAddresses(interfaces as never, [
      { Name: "Radio", NdisPhysicalMedium: 9 },
      { Name: "Cable", NdisPhysicalMedium: 14 },
    ]),
  ).toEqual(["192.168.10.2", "192.168.10.3"]);
});
