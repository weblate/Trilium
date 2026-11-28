import { expect, type Request, test } from "@playwright/test";

import { closeLaunchedDesktops, launchDesktop, setUpWithDemoContent } from "./support";

const PORT = 37880;
const WORKER_URL = /\/maplibre-gl-worker-[^/]*\.js$/;
/** Tile requests of the default VersaTiles style, which only MapLibre's worker makes. */
const VECTOR_TILE_URL = /^https:\/\/tiles\.versatiles\.org\/tiles\//;
const GEO_MAP_TITLE = "Geo Map (The Seven Wonders of the World)";

test.afterEach(async ({}, testInfo) => {
    await closeLaunchedDesktops(testInfo);
});

test("geo map loads MapLibre's worker and draws the vector basemap", async () => {
    test.setTimeout(180_000);

    const page = await setUpWithDemoContent(await launchDesktop("geomap", PORT));

    const workerRequest = new Promise<{ request: Request; failure: string | null }>((resolve) => {
        page.on("requestfinished", (request) => {
            if (WORKER_URL.test(request.url())) resolve({ request, failure: null });
        });
        page.on("requestfailed", (request) => {
            if (!WORKER_URL.test(request.url())) return;
            resolve({ request, failure: request.failure()?.errorText ?? "unknown" });
        });
    });
    let vectorTileRequested = false;
    page.on("request", (request) => {
        if (VECTOR_TILE_URL.test(request.url())) vectorTileRequested = true;
    });

    const tree = page.locator(".tree-wrapper");
    for (const title of [ "Trilium Demo", "Note Types" ]) {
        const node = tree.locator(".fancytree-node", { hasText: title }).first();
        await node.locator(".fancytree-expander").click();
    }
    await tree.locator(".fancytree-node", { hasText: GEO_MAP_TITLE }).click();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();

    const { request, failure } = await workerRequest;
    expect(failure, `${request.url()} failed to load`).toBeNull();
    expect((await request.response())?.status()).toBe(200);
    await expect.poll(() => vectorTileRequested, { timeout: 30_000 }).toBe(true);
});
