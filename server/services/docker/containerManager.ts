import net from "net";
import Docker from "dockerode";
import playwrightPkg from "playwright/package.json";
import { env } from "../../config/env";

const CONTAINER_PORT = 3000;
const PLAYWRIGHT_VERSION = playwrightPkg.version;

let docker: Docker | undefined;
function getDocker(): Docker {
  if (!docker) docker = new Docker();
  return docker;
}

export function imageName(): string {
  return process.env.BROWSER_IMAGE || `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble`;
}

export function containerName(accountId: unknown): string {
  return `reachly-browser-${String(accountId)}`;
}

async function pullImageIfMissing(image: string) {
  const d = getDocker();
  try {
    await d.getImage(image).inspect();
  } catch {
    const stream = await d.pull(image);
    await new Promise<void>((resolve, reject) => {
      d.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve()));
    });
  }
}

async function hostPortOf(container: Docker.Container) {
  const info = await container.inspect();
  const binding = info.NetworkSettings?.Ports?.[`${CONTAINER_PORT}/tcp`]?.[0];
  return { running: Boolean(info.State?.Running), port: binding ? Number(binding.HostPort) : undefined };
}

async function waitForBrowserServer(port: number | undefined, timeoutMs = 60000) {
  if (!port) throw new Error("Browser container has no published port");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect(port, env.dockerHostAddress);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (connected) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Browser container did not become ready in time");
}

/**
 * Ensures a dedicated Playwright browser-server container exists and is running for the account.
 * Returns null when Docker isolation is disabled (browsers are launched locally instead).
 */
export async function ensureContainer(
  accountId: unknown,
): Promise<{ containerId: string; containerPort: number | undefined } | null> {
  if (!env.dockerEnabled) return null;
  const d = getDocker();
  const name = containerName(accountId);

  let container = d.getContainer(name);
  try {
    const state = await hostPortOf(container);
    if (!state.running) await container.start();
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    const image = imageName();
    await pullImageIfMissing(image);
    container = await d.createContainer({
      name,
      Image: image,
      Cmd: [
        "npx",
        "-y",
        `playwright@${PLAYWRIGHT_VERSION}`,
        "run-server",
        "--port",
        String(CONTAINER_PORT),
        "--host",
        "0.0.0.0",
      ],
      ExposedPorts: { [`${CONTAINER_PORT}/tcp`]: {} },
      Labels: { "reachly.accountId": String(accountId) },
      HostConfig: {
        PortBindings: { [`${CONTAINER_PORT}/tcp`]: [{ HostIp: "127.0.0.1", HostPort: "" }] },
        NetworkMode: env.dockerNetwork,
        Memory: 1024 * 1024 * 1024,
        ShmSize: 512 * 1024 * 1024,
        RestartPolicy: { Name: "unless-stopped" },
        Init: true,
      },
    });
    await container.start();
  }

  const info = await container.inspect();
  const { port } = await hostPortOf(container);
  await waitForBrowserServer(port);
  return { containerId: info.Id, containerPort: port };
}

export async function removeContainer(containerIdOrName: string | null | undefined) {
  if (!containerIdOrName || !env.dockerEnabled) return;
  const container = getDocker().getContainer(containerIdOrName);
  try {
    await container.stop({ t: 5 }).catch(() => undefined);
    await container.remove({ force: true });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }
}

export function wsEndpointFor(account: { containerPort?: number | null } | null | undefined): string | undefined {
  if (!env.dockerEnabled || !account?.containerPort) return undefined;
  return `ws://${env.dockerHostAddress}:${account.containerPort}/`;
}
