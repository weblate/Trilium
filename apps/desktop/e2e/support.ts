import {
    _electron as electron, type ElectronApplication, expect, Locator, Page, type TestInfo
} from "@playwright/test";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";

export default class App {

    readonly noteTree: Locator;
    readonly currentNoteSplit: Locator;
    readonly currentNoteSplitTitle: Locator;
    readonly currentNoteSplitContent: Locator;
    page: Page;

    constructor(page: Page) {
        this.page = page;
        this.noteTree = page.locator(".tree-wrapper");
        this.currentNoteSplit = page.locator(".note-split:not(.hidden-ext)");
        this.currentNoteSplitTitle = this.currentNoteSplit.locator(".title-row .note-title");
        this.currentNoteSplitContent = this.currentNoteSplit.locator(".note-detail-printable.visible");
    }

    async selectNoteInNoteTree(noteTitle: string) {
        const item = this.noteTree.locator(`span.fancytree-node`, { hasText: noteTitle });
        await item.click();
        await expect(this.currentNoteSplitTitle).toHaveValue(noteTitle);
    }

    async setNoteShared(shared: boolean) {
        await this.currentNoteSplit.locator(".note-actions button").first().click();
        const menu = this.page.locator(".tn-dropdown-portal.note-actions .dropdown-menu").first();
        await expect(menu).toBeVisible();

        const sharedItem = menu.locator(".dropdown-item").filter({ has: this.page.locator(".bx-share-alt") });
        const toggle = sharedItem.locator("input");
        await expect(toggle).toBeChecked({ checked: !shared });

        await sharedItem.click();
        await expect(toggle).toBeChecked({ checked: shared });

        await this.page.keyboard.press("Escape");
    }

}

const DIST_PATH = join(__dirname, "../dist/main.mjs");

const launched: { app: ElectronApplication; dataDir: string }[] = [];

interface LaunchDesktopOpts {
    /** Written to the data directory as `security.json` before the app starts. */
    security?: Record<string, unknown>;
}

/**
 * Starts the built desktop app on a fresh data directory, which opens on the setup wizard.
 * Call {@link closeLaunchedDesktops} from `afterEach` to close it and remove the directory.
 */
export async function launchDesktop(
    name: string, port: number, { security }: LaunchDesktopOpts = {}
) {
    const dataDir = mkdtempSync(join(tmpdir(), `trilium-e2e-${name}-`));
    if (security) {
        writeFileSync(join(dataDir, "security.json"), JSON.stringify(security));
    }

    const env: Record<string, string> = {};
    for (const [ key, value ] of Object.entries(process.env)) {
        if (value !== undefined) {
            env[key] = value;
        }
    }
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.TRILIUM_INTEGRATION_TEST;
    Object.assign(env, {
        TRILIUM_DATA_DIR: dataDir,
        TRILIUM_ELECTRON_DATA_DIR: join(dataDir, "electron"),
        TRILIUM_PORT: String(port),
        ELECTRON_IS_DEV: "0"
    });

    // `ELECTRON_PATH` points at a system Electron where the npm binary cannot run (NixOS), which
    // also lacks a setuid `chrome-sandbox`.
    const executablePath = process.env.ELECTRON_PATH;
    const app = await electron.launch({
        executablePath,
        args: [ DIST_PATH, ...(executablePath ? [ "--no-sandbox" ] : []) ],
        env
    });
    launched.push({ app, dataDir });
    return app;
}

/** Sets up a knowledge base with the demo content and returns the main window. */
export async function setUpWithDemoContent(app: ElectronApplication) {
    const setup = await app.firstWindow();
    await setup.getByRole("button", { name: "Continue" }).click();
    await setup.getByText("New knowledge base").click();
    const mainPromise = app.waitForEvent("window");
    await setup.getByText("With demo content").click();
    const page = await mainPromise;
    await expect(page).toHaveTitle(/Trilium Notes$/);
    return page;
}

/** Closes every app {@link launchDesktop} started, attaching its logs when the test failed. */
export async function closeLaunchedDesktops(testInfo: TestInfo) {
    for (const { app, dataDir } of launched.splice(0)) {
        await app.close().catch(() => {});
        if (testInfo.status !== testInfo.expectedStatus) {
            await attachLogs(testInfo, dataDir);
        }
        rmSync(dataDir, { recursive: true, force: true });
    }
}

async function attachLogs(testInfo: TestInfo, dataDir: string) {
    const logDir = join(dataDir, "log");
    if (!existsSync(logDir)) {
        return;
    }
    for (const file of readdirSync(logDir)) {
        await testInfo.attach(`${basename(dataDir)}-${file}`, {
            path: join(logDir, file),
            contentType: "text/plain"
        });
    }
}
