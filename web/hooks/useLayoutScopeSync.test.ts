import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePanesStore } from "@/stores/usePanesStore";
import { useSshMachinesStore } from "@/stores/useSshMachinesStore";
import { useWorkspacesStore } from "@/stores/useWorkspacesStore";
import { DEFAULT_LAYOUT_SCOPE, collectAllScopeSessionIds, useLayoutScopeStore } from "@/stores/useLayoutScopeStore";
import { collectPanels, createPanel } from "@/lib/paneTree";
import {
  layoutScopePolicy,
  mergeForeignScopesIntoLive,
  resolveLayoutScopeForSync,
  switchLayoutScope,
  useLayoutScopeSync,
} from "./useLayoutScopeSync";
import type { LayoutSnapshotPayload, Tab, Workspace } from "@/types";

const workspace = (id: string, name = id): Workspace => ({
  id,
  name,
  createdAt: "2024-01-01T00:00:00.000Z",
  projects: [{ id: `${id}-project`, path: `/${id}` }],
});

const tab = (patch: Partial<Tab> = {}): Tab => ({
  id: "tab-1",
  title: "Terminal",
  contentType: "terminal",
  projectId: "",
  projectPath: "",
  sessionId: null,
  ...patch,
});

describe("useLayoutScopeSync", () => {
  it("普通 workspace 使用 workspace scope", () => {
    expect(resolveLayoutScopeForSync({
      workspaceId: "workspace-1",
      workspace: workspace("workspace-1"),
      activeTab: tab(),
      selectedMachineId: null,
      fallbackMachineId: null,
      sshViewActive: false,
      explicitWorkspaceChanged: false,
    })).toBe("workspace:workspace-1");
  });

  it("SSH tab 使用 machine scope", () => {
    expect(resolveLayoutScopeForSync({
      workspaceId: "workspace-1",
      workspace: workspace("workspace-1"),
      activeTab: tab({ ssh: {
        host: "host",
        port: 22,
        remotePath: "/home/user",
        machineId: "machine-1",
      } }),
      selectedMachineId: null,
      fallbackMachineId: null,
      sshViewActive: false,
      explicitWorkspaceChanged: false,
    })).toBe("ssh-machine:machine-1");
  });

  it("SSH 侧栏未点选时回退到第一台机器", () => {
    expect(resolveLayoutScopeForSync({
      workspaceId: "workspace-1",
      workspace: workspace("workspace-1"),
      activeTab: tab(),
      selectedMachineId: null,
      fallbackMachineId: "machine-1",
      sshViewActive: true,
      explicitWorkspaceChanged: false,
    })).toBe("ssh-machine:machine-1");
  });

  it("SSH 侧栏选中机器时使用 machine scope", () => {
    expect(resolveLayoutScopeForSync({
      workspaceId: "workspace-1",
      workspace: workspace("workspace-1"),
      activeTab: tab(),
      selectedMachineId: "machine-1",
      fallbackMachineId: null,
      sshViewActive: true,
      explicitWorkspaceChanged: false,
    })).toBe("ssh-machine:machine-1");
  });

  it("显式 workspace 变化时不让不匹配的旧 SSH tab 抢回 scope", () => {
    expect(resolveLayoutScopeForSync({
      workspaceId: "workspace-2",
      workspace: workspace("workspace-2"),
      activeTab: tab({
        projectId: "workspace-1-project",
        ssh: {
          host: "host",
          port: 22,
          remotePath: "/home/user",
          machineId: "machine-1",
        },
      }),
      selectedMachineId: null,
      fallbackMachineId: null,
      sshViewActive: false,
      explicitWorkspaceChanged: true,
    })).toBe("workspace:workspace-2");
  });

  it("没有 workspace 上下文时回退 default", () => {
    expect(resolveLayoutScopeForSync({
      workspaceId: null,
      workspace: undefined,
      activeTab: tab(),
      selectedMachineId: null,
      fallbackMachineId: null,
      sshViewActive: false,
      explicitWorkspaceChanged: false,
    })).toBe("workspace:default");
  });
});

function seedLivePanes(tabs: Tab[], layoutId = "layout-ws"): void {
  const rootPane = createPanel();
  rootPane.tabs = tabs;
  rootPane.activeTabId = tabs[0]?.id ?? "";
  usePanesStore.setState({
    layouts: [{
      id: layoutId,
      name: "布局 1",
      kind: "normal",
      workspaceName: "Trust",
      rootPane,
      activePaneId: rootPane.id,
    }],
    currentLayoutId: layoutId,
    rootPane,
    activePaneId: rootPane.id,
  });
}

function scopePayload(tabs: Tab[], layoutId: string): LayoutSnapshotPayload {
  const rootPane = createPanel();
  rootPane.tabs = tabs;
  rootPane.activeTabId = tabs[0]?.id ?? "";
  return {
    schemaVersion: 2,
    layouts: [{ id: layoutId, name: "布局 1", kind: "normal", rootPane, activePaneId: rootPane.id }],
    currentLayoutId: layoutId,
  };
}

function liveTabIds(): string[] {
  return collectPanels(usePanesStore.getState().rootPane).flatMap((panel) =>
    panel.tabs.map((item) => item.id),
  );
}

describe("switchLayoutScope（隔离打开时的既有语义）", () => {
  beforeEach(() => {
    layoutScopePolicy.isolationEnabled = true;
    useLayoutScopeStore.getState().resetForTest();
    seedLivePanes([tab({
      id: "ws-tab",
      title: "workspace tab",
      projectId: "project-1",
      projectPath: "/workspace",
      sessionId: "sess-1",
    })]);
  });
  afterEach(() => {
    layoutScopePolicy.isolationEnabled = false;
  });

  it("新 SSH scope 使用独立空布局而不是克隆工作空间 tabs", () => {
    switchLayoutScope("ssh-machine:machine-1");

    expect(useLayoutScopeStore.getState().activeScope).toBe("ssh-machine:machine-1");
    const panes = usePanesStore.getState();
    expect(panes.currentLayoutId).not.toBe("layout-ws");
    expect(panes.rootPane.type).toBe("panel");
    if (panes.rootPane.type === "panel") {
      expect(panes.rootPane.tabs).toEqual([]);
    }
    const workspacePayload = useLayoutScopeStore.getState().getScope("workspace:default");
    expect(workspacePayload?.layouts.some((layout) => (
      layout.rootPane.type === "panel" && layout.rootPane.tabs.some((item) => item.id === "ws-tab")
    ))).toBe(true);
  });
});

describe("隔离关闭（0.12.12 热修默认）", () => {
  beforeEach(() => {
    layoutScopePolicy.isolationEnabled = false;
    useLayoutScopeStore.getState().resetForTest();
  });

  it("默认关闭：请求任何 scope 都落到 default，当前标签不被换掉", () => {
    seedLivePanes([tab({ id: "ws-tab", projectPath: "/workspace", sessionId: "sess-1" })]);

    switchLayoutScope("ssh-machine:machine-1");

    expect(useLayoutScopeStore.getState().activeScope).toBe(DEFAULT_LAYOUT_SCOPE);
    expect(liveTabIds()).toEqual(["ws-tab"]);
  });

  it("升级路径：活动 scope 是某工作空间时切回 default 并把各 scope 的标签合并回来", () => {
    // 模拟 0.12.11 留下的状态：default 里是升级前的完整布局，活动 scope 是某工作空间
    // （只剩它自己的两个标签），另一个工作空间 scope 里还有一个标签。
    const store = useLayoutScopeStore.getState();
    store.saveScope(DEFAULT_LAYOUT_SCOPE, scopePayload([
      tab({ id: "legacy-a", projectPath: "/a", sessionId: "sess-a" }),
      tab({ id: "legacy-b", projectPath: "/b", sessionId: "sess-b" }),
    ], "layout-legacy"));
    store.saveScope("workspace:other", scopePayload([
      tab({ id: "other-1", projectPath: "/o", sessionId: "sess-o" }),
      // 与 legacy-a 同一个会话（被另一个 tab 收养过）→ 必须去重，不能两个 tab 抢一个 PTY
      tab({ id: "other-dup", projectPath: "/a", savedSessionId: "sess-a", sessionId: null }),
    ], "layout-other"));
    store.setActiveScope("workspace:current");
    seedLivePanes([
      tab({ id: "cur-1", projectPath: "/c", sessionId: "sess-c" }),
      tab({ id: "cur-2", projectPath: "/c", sessionId: "sess-c2" }),
    ], "layout-current");

    switchLayoutScope("workspace:current");

    expect(useLayoutScopeStore.getState().activeScope).toBe(DEFAULT_LAYOUT_SCOPE);
    expect(liveTabIds().sort()).toEqual(["cur-1", "cur-2", "legacy-a", "legacy-b", "other-1"].sort());
    // 合并过的 scope 被删除，下次启动不会把用户已关掉的标签再捞回来
    expect(Object.keys(useLayoutScopeStore.getState().scopes)).toEqual([DEFAULT_LAYOUT_SCOPE]);
  });

  it("hook 挂载即合并：没有展开的工作空间、没有 SSH 机器时也不能被上下文守卫挡住", () => {
    const store = useLayoutScopeStore.getState();
    store.saveScope(DEFAULT_LAYOUT_SCOPE, scopePayload([
      tab({ id: "legacy-a", projectPath: "/a", sessionId: "sess-a" }),
    ], "layout-legacy"));
    store.setActiveScope("workspace:current");
    seedLivePanes([tab({ id: "cur-1", projectPath: "/c", sessionId: "sess-c" })], "layout-current");
    useWorkspacesStore.setState({ workspaces: [], expandedWorkspaceId: null });
    useSshMachinesStore.setState({ machines: [] } as never);

    renderHook(() => useLayoutScopeSync());

    expect(useLayoutScopeStore.getState().activeScope).toBe(DEFAULT_LAYOUT_SCOPE);
    expect(liveTabIds().sort()).toEqual(["cur-1", "legacy-a"]);
  });

  it("没有外来 scope 时合并是 no-op", () => {
    seedLivePanes([tab({ id: "ws-tab", projectPath: "/workspace", sessionId: "sess-1" })]);
    expect(mergeForeignScopesIntoLive()).toBe(0);
    expect(liveTabIds()).toEqual(["ws-tab"]);
  });
});

describe("collectAllScopeSessionIds", () => {
  it("并集覆盖所有 scope 的 sessionId 与 savedSessionId", () => {
    const store = useLayoutScopeStore.getState();
    store.resetForTest();
    store.saveScope(DEFAULT_LAYOUT_SCOPE, scopePayload([tab({ id: "a", sessionId: "s-live" })], "l1"));
    store.saveScope("workspace:x", scopePayload([
      tab({ id: "b", sessionId: null, savedSessionId: "s-saved" }),
    ], "l2"));

    expect([...collectAllScopeSessionIds()].sort()).toEqual(["s-live", "s-saved"]);
  });
});
