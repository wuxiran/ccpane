import { useEffect, useRef } from "react";
import { useLayoutScopeStore, selectActiveScope } from "@/stores/useLayoutScopeStore";
import { usePanesStore } from "@/stores/usePanesStore";
import { useWorkspacesStore } from "@/stores/useWorkspacesStore";
import { useActivityBarStore } from "@/stores/useActivityBarStore";
import { useSshMachinePreferencesStore } from "@/stores/useSshMachinePreferencesStore";
import { useSshMachinesStore } from "@/stores/useSshMachinesStore";
import { collectPanels, findPane, generateId } from "@/lib/paneTree";
import { collectTerminalSessionIdsWithSaved } from "@/lib/paneSessions";
import type { LayoutSnapshotPayload, PaneNode, Tab, Workspace } from "@/types";
import {
  DEFAULT_LAYOUT_SCOPE,
  resolveLayoutScope,
  sshMachineLayoutScope,
  workspaceLayoutScope,
  type LayoutScope,
} from "@/utils/layoutScope";

/**
 * 布局空间隔离总开关（0.12.12 热修，默认关）。
 *
 * 0.12.10 引入的按工作空间 / SSH 机器隔离布局树，让"当前 scope 之外"的会话从所有
 * 保护集里消失：陈旧输出清理、共享快照 apply 后的杀会话复核、每分钟覆写的可恢复
 * 会话表，全都只看当前面板树。0.12.10 里 profileId 带冒号让这条链路一直报错跳过，
 * 0.12.11 修好冒号后清理真正跑起来——升级即删掉几百个会话输出文件、恢复表被裁成
 * 当前工作空间的几条。在各收集器全部改成跨 scope 之前不允许打开。
 * 关闭时回到单布局，并在启动时把各 scope 里的标签合并回 default（见 mergeForeignScopesIntoLive）。
 * 用对象而不是常量：测试需要临时打开验证隔离逻辑本身。
 */
export const layoutScopePolicy = { isolationEnabled: false };

interface LayoutScopeSyncContext {
  workspaceId: string | null;
  workspace: Workspace | undefined;
  activeTab: Tab | null;
  selectedMachineId: string | null;
  fallbackMachineId: string | null;
  sshViewActive: boolean;
  explicitWorkspaceChanged: boolean;
}

function activeTabFromPanes(): Tab | null {
  const state = usePanesStore.getState();
  const pane = findPane(state.rootPane, state.activePaneId);
  if (pane?.type !== "panel") return null;
  return pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? null;
}

function workspaceMatchesTab(workspace: Workspace, tab: Tab): boolean {
  const tabWorkspaceName = tab.workspaceName?.trim();
  if (tabWorkspaceName && (tabWorkspaceName === workspace.id
    || tabWorkspaceName === workspace.name
    || tabWorkspaceName === workspace.alias)) {
    return true;
  }
  return workspace.projects.some((project) => (
    project.id === tab.projectId
    || (Boolean(tab.projectPath) && project.path === tab.projectPath)
  ));
}

/** 解析当前 UI 上下文的布局空间，供同步逻辑和测试复用。 */
export function resolveLayoutScopeForSync(context: LayoutScopeSyncContext): LayoutScope {
  const activeMachineId = context.activeTab?.ssh?.machineId;
  const hasActiveSsh = Boolean(activeMachineId?.trim());
  const workspaceScope = workspaceLayoutScope(context.workspaceId);
  const selectedMachineScope = sshMachineLayoutScope(
    context.selectedMachineId ?? context.fallbackMachineId,
  );

  if (context.sshViewActive && selectedMachineScope !== DEFAULT_LAYOUT_SCOPE) {
    return selectedMachineScope;
  }
  if (hasActiveSsh && (!context.explicitWorkspaceChanged
    || (context.workspace != null && workspaceMatchesTab(context.workspace, context.activeTab!)))) {
    return resolveLayoutScope({ activeTab: context.activeTab });
  }
  return workspaceScope;
}

function clonePayload(payload: LayoutSnapshotPayload): LayoutSnapshotPayload {
  return structuredClone(payload);
}

function currentPayload(): LayoutSnapshotPayload {
  return usePanesStore.getState().exportLayoutSnapshotPayload();
}

function createEmptyPanel(): PaneNode {
  const paneId = generateId("pane");
  return {
    type: "panel",
    id: paneId,
    tabs: [],
    activeTabId: "",
  };
}

function createIndependentScopePayload(): LayoutSnapshotPayload {
  const normalRoot = createEmptyPanel();
  const starredRoot = createEmptyPanel();
  const normalId = generateId("layout");
  const starredId = generateId("layout");
  return {
    schemaVersion: 2,
    layouts: [
      {
        id: normalId,
        name: "布局 1",
        kind: "normal",
        rootPane: normalRoot,
        activePaneId: normalRoot.id,
      },
      {
        id: starredId,
        name: "星标",
        kind: "starred",
        rootPane: starredRoot,
        activePaneId: starredRoot.id,
      },
    ],
    currentLayoutId: normalId,
  };
}

/** 收集一份 payload 里所有树（含星标）引用的 tab id 与会话 id，用于合并去重。 */
function collectPayloadIdentities(payload: LayoutSnapshotPayload): {
  tabIds: Set<string>;
  sessionIds: Set<string>;
} {
  const tabIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const layout of payload.layouts) {
    for (const panel of collectPanels(layout.rootPane)) {
      for (const tab of panel.tabs) {
        tabIds.add(tab.id);
        for (const id of collectTerminalSessionIdsWithSaved(tab)) sessionIds.add(id);
      }
    }
  }
  return { tabIds, sessionIds };
}

/**
 * 隔离关闭后的一次性回收：把 default 之外每个 scope 里、当前布局里没有的标签，
 * 追加到当前布局的活动面板，然后删掉那个 scope。按 tab id 与会话 id 双重去重——
 * 同一个会话可能在别的 scope 里被另一个 tab 收养过，不能出现两个 tab 抢一个 PTY。
 * 幂等：合并过的 scope 被删除，下次启动不会把用户已关掉的标签再捞回来。
 */
export function mergeForeignScopesIntoLive(): number {
  const scopeStore = useLayoutScopeStore.getState();
  const foreign = (Object.keys(scopeStore.scopes) as LayoutScope[]).filter(
    (scope) => scope !== DEFAULT_LAYOUT_SCOPE,
  );
  if (foreign.length === 0) return 0;

  const live = clonePayload(currentPayload());
  const { tabIds, sessionIds } = collectPayloadIdentities(live);
  const target = live.layouts.find((layout) => layout.id === live.currentLayoutId)
    ?? live.layouts.find((layout) => layout.kind !== "starred")
    ?? live.layouts[0];
  if (!target) return 0;
  const panel = (() => {
    const active = findPane(target.rootPane, target.activePaneId);
    if (active?.type === "panel") return active;
    return collectPanels(target.rootPane)[0];
  })();
  if (!panel) return 0;

  let merged = 0;
  for (const scope of foreign) {
    const payload = scopeStore.scopes[scope];
    for (const layout of payload?.layouts ?? []) {
      for (const source of collectPanels(layout.rootPane)) {
        for (const tab of source.tabs) {
          if (tabIds.has(tab.id)) continue;
          const tabSessions = collectTerminalSessionIdsWithSaved(tab);
          if (tabSessions.some((id) => sessionIds.has(id))) continue;
          panel.tabs.push(structuredClone(tab));
          tabIds.add(tab.id);
          for (const id of tabSessions) sessionIds.add(id);
          merged += 1;
        }
      }
    }
  }
  if (!panel.activeTabId && panel.tabs.length > 0) panel.activeTabId = panel.tabs[0].id;

  if (merged > 0) {
    usePanesStore.getState().applyLayoutSnapshotPayload(live);
    console.info(`[layout-scope] merged ${merged} tab(s) from ${foreign.length} retired scope(s) into the single layout`);
  }
  for (const scope of foreign) scopeStore.removeScope(scope);
  return merged;
}

function initializeAndApplyScope(requestedScope: LayoutScope): void {
  const targetScope = layoutScopePolicy.isolationEnabled ? requestedScope : DEFAULT_LAYOUT_SCOPE;
  const scopeStore = useLayoutScopeStore.getState();
  const currentScope = scopeStore.activeScope;
  const livePayload = currentPayload();

  // Legacy panes lived in one implicit scope. Preserve them before the first projection.
  if (!scopeStore.getScope(DEFAULT_LAYOUT_SCOPE)) {
    scopeStore.saveScope(
      DEFAULT_LAYOUT_SCOPE,
      currentScope === DEFAULT_LAYOUT_SCOPE ? livePayload : createIndependentScopePayload(),
    );
  }

  if (currentScope !== targetScope) {
    scopeStore.saveScope(currentScope, livePayload);
  }

  let targetPayload = scopeStore.getScope(targetScope);
  if (!targetPayload) {
    targetPayload = createIndependentScopePayload();
    scopeStore.saveScope(targetScope, targetPayload);
  }

  scopeStore.setActiveScope(targetScope);
  if (currentScope !== targetScope) {
    usePanesStore.getState().applyLayoutSnapshotPayload(clonePayload(targetPayload));
  }
  if (!layoutScopePolicy.isolationEnabled) {
    mergeForeignScopesIntoLive();
  }
}

export function switchLayoutScope(targetScope: LayoutScope): void {
  initializeAndApplyScope(targetScope);
}

/** 按工作空间和活动 SSH 标签隔离 panes 布局快照。 */
export function useLayoutScopeSync(): void {
  const workspaceId = useWorkspacesStore((state) => state.expandedWorkspaceId);
  const workspaces = useWorkspacesStore((state) => state.workspaces);
  const activeView = useActivityBarStore((state) => state.activeView);
  const selectedMachineId = useSshMachinePreferencesStore((state) => state.selectedMachineId);
  const machines = useSshMachinesStore((state) => state.machines);
  const activeTabKey = usePanesStore((state) => {
    const pane = findPane(state.rootPane, state.activePaneId);
    if (pane?.type !== "panel") return null;
    const activeTab = pane.tabs.find((tab) => tab.id === pane.activeTabId);
    return `${pane.id}\u0000${pane.activeTabId}\u0000${activeTab?.ssh?.machineId ?? ""}`;
  });
  const activeScope = useLayoutScopeStore(selectActiveScope);
  const previousWorkspaceId = useRef(workspaceId);
  const previousView = useRef(activeView);
  const explicitWorkspaceLock = useRef<{ workspaceId: string | null; tabKey: string | null } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    // 隔离关闭时不需要任何上下文：直接落到 default 并把遗留 scope 合并回来。
    // 不能走下面的"等上下文就位"守卫——启动时 expandedWorkspaceId 为 null 且没有
    // SSH 机器的用户会永远卡在守卫上，合并不触发（0.12.12 实机首跑踩到）。
    if (!layoutScopePolicy.isolationEnabled) {
      initialized.current = true;
      initializeAndApplyScope(DEFAULT_LAYOUT_SCOPE);
      return;
    }
    const workspace = workspaceId
      ? workspaces.find((item) => item.id === workspaceId)
      : undefined;
    const activeTab = activeTabFromPanes();
    const sshViewActive = activeView === "ssh";
    const fallbackMachineId = machines[0]?.id ?? null;
    if (!initialized.current
      && !workspaceId
      && !activeTab?.ssh?.machineId
      && !selectedMachineId
      && !fallbackMachineId
      && activeScope !== DEFAULT_LAYOUT_SCOPE) {
      return;
    }
    const explicitWorkspaceChanged = initialized.current
      && previousWorkspaceId.current !== workspaceId
      && previousView.current !== "ssh";
    if (explicitWorkspaceChanged) {
      explicitWorkspaceLock.current = { workspaceId, tabKey: activeTabKey };
    } else if (sshViewActive || (explicitWorkspaceLock.current
      && explicitWorkspaceLock.current.workspaceId !== workspaceId)) {
      explicitWorkspaceLock.current = null;
    } else if (explicitWorkspaceLock.current
      && explicitWorkspaceLock.current.tabKey !== activeTabKey) {
      if (!activeTab?.ssh || !workspace || workspaceMatchesTab(workspace, activeTab)) {
        explicitWorkspaceLock.current = null;
      } else {
        explicitWorkspaceLock.current.tabKey = activeTabKey;
      }
    }
    previousWorkspaceId.current = workspaceId;
    previousView.current = activeView;
    initialized.current = true;

    const targetScope = resolveLayoutScopeForSync({
      workspaceId,
      workspace,
      activeTab,
      selectedMachineId,
      fallbackMachineId,
      sshViewActive,
      explicitWorkspaceChanged: explicitWorkspaceChanged
        || explicitWorkspaceLock.current != null,
    });
    initializeAndApplyScope(targetScope);
  }, [activeTabKey, activeScope, activeView, machines, selectedMachineId, workspaceId, workspaces]);

  useEffect(() => {
    return usePanesStore.subscribe(() => {
      const scope = useLayoutScopeStore.getState().activeScope;
      useLayoutScopeStore.getState().saveScope(scope, currentPayload());
    });
  }, []);
}

export { DEFAULT_LAYOUT_SCOPE };
