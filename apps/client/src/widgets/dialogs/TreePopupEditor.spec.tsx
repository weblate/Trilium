import { type ComponentChildren, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ViewScope } from "../../services/link";

const mocks = vi.hoisted(() => ({
    openContextWithNote: vi.fn(),
    isMobile: vi.fn(() => false)
}));

vi.mock("../../components/app_context", () => ({
    default: {
        triggerCommand: vi.fn(),
        tabManager: {
            openContextWithNote: mocks.openContextWithNote,
            registerDetachedContext: vi.fn(),
            unregisterDetachedContext: vi.fn()
        }
    }
}));

vi.mock("../../components/note_context", () => ({
    default: class {
        ntxId: string;
        hoistedNoteId: string;
        notePath: string | undefined;
        noteId: string | undefined;
        viewScope: ViewScope | undefined;
        triggerEvent = vi.fn();

        constructor(ntxId: string, hoistedNoteId = "root") {
            this.ntxId = ntxId;
            this.hoistedNoteId = hoistedNoteId;
        }

        async setNote(notePath: string) {
            this.notePath = notePath;
            this.noteId = notePath.split("/").at(-1);
            this.viewScope = { viewMode: "default" };
        }
    }
}));

vi.mock("../../services/i18n", () => ({ t: (key: string) => key }));

vi.mock("../../services/utils", async (importActual) => {
    const actual = await importActual<typeof import("../../services/utils")>();
    return { ...actual, default: { ...actual.default, isMobile: mocks.isMobile } };
});

interface ModalStubProps {
    children?: ComponentChildren;
    show?: boolean;
    customTitleBarButtons?: { onClick: () => void }[];
}

vi.mock("../react/Modal", () => ({
    default: ({ children, show, customTitleBarButtons }: ModalStubProps) => (
        <div className="modal-stub" data-shown={String(!!show)}>
            {customTitleBarButtons?.map((button) => (
                <button key="maximize" className="maximize-stub" onClick={() => button.onClick()} />
            ))}
            {children}
        </div>
    )
}));

vi.mock("../react/hooks/legacy", () => ({ useLegacyWidget: () => [ <div />, {} ] }));
vi.mock("../react/hooks/content", () => ({ useContainedLinkNavigation: () => {} }));
vi.mock("../layout/TitleRow", () => ({ default: () => null }));
vi.mock("../NoteDetail", () => ({ default: () => null }));
vi.mock("../PromotedAttributes", () => ({ default: () => null }));
vi.mock("../note_tree", () => ({ default: class {} }));

import Component from "../../components/component";
import { ParentComponent } from "../react/react_utils";
import TreePopupEditor from "./TreePopupEditor";

let container: HTMLDivElement;
let parent: Component;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMobile.mockReturnValue(false);
    container = document.createElement("div");
    document.body.appendChild(container);
    parent = new Component();
});

afterEach(() => {
    act(() => render(null, container));
    container.remove();
});

function mount() {
    act(() => {
        render(
            <ParentComponent.Provider value={parent}>
                <TreePopupEditor />
            </ParentComponent.Provider>,
            container
        );
    });
}

async function openLaunchBarConfig() {
    await act(async () => {
        await parent.handleEvent("openInTreePopup", {
            noteIdOrPath: "root/_hidden/_lbRoot/_lbVisibleLaunchers/_lbZenMode",
            hoistedNoteId: "_lbRoot"
        } as never);
    });
}

describe("TreePopupEditor", () => {
    it("maximizes into a tab hoisted to the same subtree, on the note in view", async () => {
        mount();
        await openLaunchBarConfig();

        const maximize = container.querySelector<HTMLElement>(".maximize-stub");
        expect(maximize).not.toBeNull();
        await act(async () => maximize?.click());

        expect(mocks.openContextWithNote).toHaveBeenCalledWith(
            "root/_hidden/_lbRoot/_lbVisibleLaunchers/_lbZenMode",
            { hoistedNoteId: "_lbRoot", viewScope: { viewMode: "default" }, activate: true }
        );
        expect(container.querySelector<HTMLElement>(".modal-stub")?.dataset.shown).toBe("false");
    });

    it("offers no maximize on mobile", async () => {
        mocks.isMobile.mockReturnValue(true);
        mount();
        await openLaunchBarConfig();

        expect(container.querySelector<HTMLElement>(".modal-stub")?.dataset.shown).toBe("true");
        expect(container.querySelector(".maximize-stub")).toBeNull();
    });
});
