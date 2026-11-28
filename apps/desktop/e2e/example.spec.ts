import { expect, test } from "@playwright/test";

import App, { closeLaunchedDesktops, launchDesktop, setUpWithDemoContent } from "./support";

const PORT = 37860;

test.afterEach(async ({}, testInfo) => {
    await closeLaunchedDesktops(testInfo);
});

test("First setup", async () => {
    test.setTimeout(180_000);

    const mainWindow = await setUpWithDemoContent(await launchDesktop("setup", PORT));

    const support = new App(mainWindow);
    await support.selectNoteInNoteTree("Trilium Demo");
    await support.setNoteShared(true);

    await expect(support.currentNoteSplit.locator(".share-badge").first()).toBeVisible();
});
