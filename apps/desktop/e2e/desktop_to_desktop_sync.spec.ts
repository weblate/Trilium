import { expect, test } from "@playwright/test";

import { closeLaunchedDesktops, launchDesktop } from "./support";

declare global {
    interface Window {
        glob: { getHeaders(): Promise<Record<string, string>> };
    }
}

const A_PORT = 37870;
const B_PORT = 37871;

test.afterEach(async ({}, testInfo) => {
    await closeLaunchedDesktops(testInfo);
});

// A picks "Connect a desktop app" and becomes the sync target; B creates a knowledge base and
// points its sync server at A, as the setup wizard instructs.
test("desktop-to-desktop setup opens the main window on the receiving desktop", async () => {
    test.setTimeout(180_000);

    const a = await launchDesktop("a", A_PORT, { security: { allowLanAccess: true } });
    const b = await launchDesktop("b", B_PORT, { security: { allowLanAccess: false } });

    const aSetup = await a.firstWindow();
    await aSetup.getByRole("button", { name: "Continue" }).click();
    await aSetup.getByText("Connect a desktop app").click();

    const bSetup = await b.firstWindow();
    await bSetup.getByRole("button", { name: "Continue" }).click();
    await bSetup.getByText("New knowledge base").click();
    const bMainPromise = b.waitForEvent("window");
    await bSetup.getByText("Empty").click();
    const bMain = await bMainPromise;
    await expect(bMain).toHaveTitle(/Trilium Notes$/);
    await bMain.waitForFunction(() => typeof window.glob?.getHeaders === "function");

    const aMainPromise = a.waitForEvent("window", { timeout: 90_000 });

    // What the Sync pane's "Test now" button does: save the address, then `sync/test`.
    const testResult = await bMain.evaluate(async (host) => {
        const headers = { ...(await window.glob.getHeaders()), "content-type": "application/json" };
        const save = await fetch("api/options", {
            method: "PUT",
            headers,
            body: JSON.stringify({ syncServerHost: host })
        });
        if (!save.ok) {
            throw new Error(`Saving syncServerHost failed: ${save.status} ${await save.text()}`);
        }
        const res = await fetch("api/sync/test", { method: "POST", headers });
        return await res.json();
    }, `http://127.0.0.1:${A_PORT}`);
    expect(testResult).toMatchObject({ success: true });

    const aMain = await aMainPromise;
    await expect(aMain).toHaveTitle(/Trilium Notes$/);
    await expect.poll(() => aSetup.isClosed()).toBe(true);
});
