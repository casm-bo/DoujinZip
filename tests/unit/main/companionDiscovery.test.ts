import { expect, it, vi } from "vitest";
import { Bonjour } from "bonjour-service";
import {
  CompanionDiscovery,
  rankDiscoveryAddresses,
} from "../../../src/main/services/companion/companionDiscovery";
const mocks = vi.hoisted(() => ({
  instances: [] as {
    publish: ReturnType<typeof vi.fn>;
    unpublishAll: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("bonjour-service", () => ({
  Bonjour: vi.fn(function () {
    const instance = {
      publish: vi.fn(() => ({ on: vi.fn() })),
      unpublishAll: vi.fn((done: () => void) => done()),
      destroy: vi.fn(),
    };
    mocks.instances.push(instance);
    return instance;
  }),
}));
vi.mock("util", () => ({
  promisify: () => async () => ({
    stdout: JSON.stringify([
      { Name: "Cable", NdisPhysicalMedium: 14 },
      { Name: "Radio", NdisPhysicalMedium: 9 },
    ]),
  }),
}));
vi.mock("os", () => ({
  networkInterfaces: () => ({
    Cable: [{ address: "192.168.10.2", family: "IPv4", internal: false }],
    Radio: [{ address: "192.168.10.3", family: "IPv4", internal: false }],
  }),
}));

it("binds advertisements to each physical interface and cleans up before restarting", async () => {
  vi.stubGlobal("process", { ...process, platform: "win32" });
  try {
    const discovery = new CompanionDiscovery();
    await discovery.start(
      "00000000-0000-4000-8000-000000000001",
      "Test server",
      47831,
    );
    expect(vi.mocked(Bonjour).mock.calls.map(([options]) => options)).toEqual([
      { interface: "192.168.10.2", bind: "0.0.0.0" },
      { interface: "192.168.10.3", bind: "0.0.0.0" },
    ]);
    expect(mocks.instances[0].publish.mock.calls[0][0].name).not.toBe(
      mocks.instances[1].publish.mock.calls[0][0].name,
    );
    await discovery.start(
      "00000000-0000-4000-8000-000000000001",
      "Test server",
      47831,
    );
    expect(mocks.instances[0].destroy).toHaveBeenCalledOnce();
    expect(mocks.instances[1].destroy).toHaveBeenCalledOnce();
    discovery.stop();
    expect(
      mocks.instances.every(
        (instance) => instance.destroy.mock.calls.length === 1,
      ),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
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
