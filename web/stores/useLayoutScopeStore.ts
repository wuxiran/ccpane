import { create } from "zustand";
import { persist } from "zustand/middleware";
import { collectTerminalSessionIdsWithSavedFromTree } from "@/lib/paneSessions";
import type { LayoutSnapshotPayload } from "@/types";
import { DEFAULT_LAYOUT_SCOPE, type LayoutScope } from "@/utils/layoutScope";

export const LAYOUT_SCOPE_STORAGE_KEY = "cc-panes-layout-scopes";
export { DEFAULT_LAYOUT_SCOPE };

export interface LayoutScopeState {
  scopes: Record<string, LayoutSnapshotPayload>;
  activeScope: LayoutScope;
  saveScope: (scope: LayoutScope, payload: LayoutSnapshotPayload) => void;
  getScope: (scope: LayoutScope) => LayoutSnapshotPayload | undefined;
  removeScope: (scope: LayoutScope) => void;
  setActiveScope: (scope: LayoutScope) => void;
  reset: () => void;
  resetForTest: () => void;
}

function clonePayload(payload: LayoutSnapshotPayload): LayoutSnapshotPayload {
  return structuredClone(payload);
}

const initialState = {
  scopes: {} as Record<string, LayoutSnapshotPayload>,
  activeScope: DEFAULT_LAYOUT_SCOPE,
};

export const selectActiveScope = (state: LayoutScopeState): LayoutScope => state.activeScope;

export function getActiveLayoutScope(): LayoutScope {
  return useLayoutScopeStore.getState().activeScope;
}

/**
 * 所有 scope（含未激活的）里引用的会话 id。任何"哪些会话还有人要"的保护集都必须
 * 并上这一份：当前面板树只是活动 scope，别的 scope 里的会话同样是用户的。
 * 0.12.11 的输出清理只看当前树，把其他工作空间的几百个会话输出当垃圾删了。
 */
export function collectAllScopeSessionIds(): Set<string> {
  const ids = new Set<string>();
  for (const payload of Object.values(useLayoutScopeStore.getState().scopes)) {
    for (const layout of payload.layouts) {
      for (const id of collectTerminalSessionIdsWithSavedFromTree(layout.rootPane)) ids.add(id);
    }
  }
  return ids;
}

export const useLayoutScopeStore = create<LayoutScopeState>()(
  persist(
    (set, get) => ({
      ...initialState,
      saveScope: (scope, payload) => set((state) => ({
        scopes: { ...state.scopes, [scope]: clonePayload(payload) },
      })),
      getScope: (scope) => {
        const payload = get().scopes[scope];
        return payload ? clonePayload(payload) : undefined;
      },
      removeScope: (scope) => set((state) => {
        if (!(scope in state.scopes)) return {};
        const scopes = { ...state.scopes };
        delete scopes[scope];
        return { scopes };
      }),
      setActiveScope: (activeScope) => set({ activeScope }),
      reset: () => set({
        scopes: {},
        activeScope: DEFAULT_LAYOUT_SCOPE,
      }),
      resetForTest: () => set({
        scopes: {},
        activeScope: DEFAULT_LAYOUT_SCOPE,
      }),
    }),
    {
      name: LAYOUT_SCOPE_STORAGE_KEY,
      version: 2,
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<LayoutScopeState>;
        const defaultPayload = persisted.scopes?.[DEFAULT_LAYOUT_SCOPE];
        return {
          ...initialState,
          scopes: defaultPayload
            ? { [DEFAULT_LAYOUT_SCOPE]: clonePayload(defaultPayload) }
            : {},
          activeScope: DEFAULT_LAYOUT_SCOPE,
        };
      },
      partialize: (state) => ({
        scopes: state.scopes,
        activeScope: state.activeScope,
      }),
    },
  ),
);
