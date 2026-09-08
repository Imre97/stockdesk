const HEALTH_URL = "http://localhost:3000/api/v1/health";
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 500;

interface HealthBody {
  ready?: boolean;
}

async function isReady(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);

    if (!response.ok) return false;

    const body = (await response.json()) as HealthBody;

    return body.ready === true;
  } catch {
    return false;
  }
}

/**
 * The API web server prepared the database and seeded the symbol master while booting; the
 * suite waits here until the health endpoint reports the boot tasks finished.
 */
export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await isReady()) return;

    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }

  throw new Error(`The API did not report ready at ${HEALTH_URL} within ${READY_TIMEOUT_MS} ms.`);
}
