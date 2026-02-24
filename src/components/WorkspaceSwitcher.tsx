import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils";
import {
  ChevronDown, ChevronRight, Pin, PinOff,
  Eye, EyeOff, GripVertical, MoreHorizontal,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useWorkspacesStore } from "@/stores";
import type { Workspace } from "@/types";

// ============ 行操作菜单（共享） ============

interface RowMenuProps {
  workspace: Workspace;
  onTogglePin: (ws: Workspace) => void;
  onToggleHidden: (ws: Workspace) => void;
}

function WorkspaceRowMenu({ workspace, onTogglePin, onToggleHidden }: RowMenuProps) {
  const { t } = useTranslation("sidebar");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center w-5 h-5 rounded opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
          style={{ color: "var(--app-text-tertiary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--app-hover)";
            e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.opacity = "";
          }}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        style={{
          background: "var(--app-glass-bg-heavy)",
          border: "1px solid var(--app-glass-border)",
          backdropFilter: "blur(20px)",
        }}
      >
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onTogglePin(workspace); }}
        >
          {workspace.pinned ? (
            <>
              <PinOff className="w-3.5 h-3.5 mr-2" />
              <span>{t("unpin", { ns: "common" })}</span>
            </>
          ) : (
            <>
              <Pin className="w-3.5 h-3.5 mr-2" />
              <span>{t("pin", { ns: "common" })}</span>
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onToggleHidden(workspace); }}
        >
          {workspace.hidden ? (
            <>
              <Eye className="w-3.5 h-3.5 mr-2" />
              <span>{t("show", { ns: "common" })}</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5 mr-2" />
              <span>{t("hide", { ns: "common" })}</span>
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============ WorkspaceRow（不可拖拽） ============

interface WorkspaceRowProps {
  workspace: Workspace;
  isActive: boolean;
  onSelect: (ws: Workspace) => void;
  onTogglePin: (ws: Workspace) => void;
  onToggleHidden: (ws: Workspace) => void;
  dimmed?: boolean;
}

function WorkspaceRow({
  workspace,
  isActive,
  onSelect,
  onTogglePin,
  onToggleHidden,
  dimmed = false,
}: WorkspaceRowProps) {
  const displayName = workspace.alias || workspace.name;

  return (
    <div
      style={{ opacity: dimmed ? 0.45 : 1 }}
      className="flex items-center gap-1 rounded-md group"
    >
      <div className="w-5 shrink-0" />

      <button
        className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors min-w-0"
        style={{
          color: isActive ? "var(--app-accent)" : "var(--app-text-primary)",
          background: isActive ? "var(--app-hover)" : "transparent",
          fontWeight: isActive ? 600 : 400,
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = "var(--app-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
        onClick={() => onSelect(workspace)}
      >
        {workspace.pinned && (
          <Pin className="w-3 h-3 shrink-0" style={{ color: "var(--app-accent)" }} />
        )}
        <span className="truncate">{displayName}</span>
      </button>

      <WorkspaceRowMenu
        workspace={workspace}
        onTogglePin={onTogglePin}
        onToggleHidden={onToggleHidden}
      />
    </div>
  );
}

// ============ SortableWorkspaceRow（可拖拽，仅在 pinned DndContext 内使用） ============

interface SortableRowProps {
  workspace: Workspace;
  isActive: boolean;
  onSelect: (ws: Workspace) => void;
  onTogglePin: (ws: Workspace) => void;
  onToggleHidden: (ws: Workspace) => void;
}

function SortableWorkspaceRow({
  workspace,
  isActive,
  onSelect,
  onTogglePin,
  onToggleHidden,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workspace.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const displayName = workspace.alias || workspace.name;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 rounded-md group"
    >
      {/* 拖拽手柄 */}
      <button
        className="flex items-center justify-center w-5 h-5 rounded cursor-grab opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
        style={{ color: "var(--app-text-tertiary)" }}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3 h-3" />
      </button>

      {/* 工作空间名称 — 点击切换 */}
      <button
        className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-[13px] transition-colors min-w-0"
        style={{
          color: isActive ? "var(--app-accent)" : "var(--app-text-primary)",
          background: isActive ? "var(--app-hover)" : "transparent",
          fontWeight: isActive ? 600 : 400,
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = "var(--app-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
        onClick={() => onSelect(workspace)}
      >
        {workspace.pinned && (
          <Pin className="w-3 h-3 shrink-0" style={{ color: "var(--app-accent)" }} />
        )}
        <span className="truncate">{displayName}</span>
      </button>

      {/* 操作菜单 */}
      <WorkspaceRowMenu
        workspace={workspace}
        onTogglePin={onTogglePin}
        onToggleHidden={onToggleHidden}
      />
    </div>
  );
}

// ============ WorkspaceSwitcher ============

interface WorkspaceSwitcherProps {
  onExpandSidebar?: () => void;
}

export default function WorkspaceSwitcher({ onExpandSidebar }: WorkspaceSwitcherProps) {
  const { t } = useTranslation("sidebar");
  const [open, setOpen] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);

  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const expandedWorkspaceId = useWorkspacesStore((s) => s.expandedWorkspaceId);
  const expandWorkspace = useWorkspacesStore((s) => s.expandWorkspace);
  const updatePinned = useWorkspacesStore((s) => s.updatePinned);
  const updateHidden = useWorkspacesStore((s) => s.updateHidden);
  const reorder = useWorkspacesStore((s) => s.reorder);

  const activeWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === expandedWorkspaceId),
    [workspaces, expandedWorkspaceId]
  );

  // NOTE: store 中有 pinnedWorkspaces() 等 getter，但每次调用返回新引用，
  // 不适合直接用 useStore(s => s.pinnedWorkspaces()) 订阅（会导致不必要的重渲染）。
  // 因此在组件内使用 useMemo 缓存分组结果。
  const pinned = useMemo(
    () => workspaces.filter((ws) => ws.pinned),
    [workspaces]
  );
  const unpinnedVisible = useMemo(
    () => workspaces.filter((ws) => !ws.pinned && !ws.hidden),
    [workspaces]
  );
  const hidden = useMemo(
    () => workspaces.filter((ws) => ws.hidden),
    [workspaces]
  );
  const moreCount = unpinnedVisible.length + hidden.length;

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleSelect = useCallback(
    (ws: Workspace) => {
      expandWorkspace(ws.id);
      onExpandSidebar?.();
      setOpen(false);
    },
    [expandWorkspace, onExpandSidebar]
  );

  const handleTogglePin = useCallback(
    (ws: Workspace) => {
      updatePinned(ws.name, !ws.pinned).catch((e) => {
        toast.error(t("pinFailed", { error: getErrorMessage(e) }));
      });
    },
    [updatePinned]
  );

  const handleToggleHidden = useCallback(
    (ws: Workspace) => {
      updateHidden(ws.name, !ws.hidden).catch((e) => {
        toast.error(t("hideFailed", { error: getErrorMessage(e) }));
      });
    },
    [updateHidden]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // 找出当前拖拽所在的列表（pinned）
      const oldIndex = pinned.findIndex((ws) => ws.id === active.id);
      const newIndex = pinned.findIndex((ws) => ws.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(pinned, oldIndex, newIndex);
      const allNames = [
        ...reordered.map((ws) => ws.name),
        ...unpinnedVisible.map((ws) => ws.name),
        ...hidden.map((ws) => ws.name),
      ];
      reorder(allNames).catch((e) => {
        toast.error(t("reorderFailed", { error: getErrorMessage(e) }));
      });
    },
    [pinned, unpinnedVisible, hidden, reorder]
  );

  const triggerLabel = activeWorkspace
    ? activeWorkspace.alias || activeWorkspace.name
    : t("workspaceLabel");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors text-[13px] max-w-[180px]"
          style={{ color: "var(--app-text-primary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--app-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[260px] p-2"
        style={{
          background: "var(--app-glass-bg-heavy)",
          border: "1px solid var(--app-glass-border)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {workspaces.length === 0 ? (
          <div
            className="text-[12px] text-center py-4"
            style={{ color: "var(--app-text-tertiary)" }}
          >
            {t("noWorkspacesAvailable")}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {/* Pinned 区域（可拖拽排序） */}
            {pinned.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={pinned.map((ws) => ws.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {pinned.map((ws) => (
                    <SortableWorkspaceRow
                      key={ws.id}
                      workspace={ws}
                      isActive={ws.id === expandedWorkspaceId}
                      onSelect={handleSelect}
                      onTogglePin={handleTogglePin}
                      onToggleHidden={handleToggleHidden}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}

            {/* 分隔线 */}
            {pinned.length > 0 && moreCount > 0 && (
              <div
                className="h-px mx-2 my-1"
                style={{ background: "var(--app-border)" }}
              />
            )}

            {/* "更多工作空间" 折叠区 */}
            {moreCount > 0 && (
              <>
                <button
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] transition-colors w-full text-left"
                  style={{ color: "var(--app-text-secondary)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--app-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                  onClick={() => setMoreExpanded((prev) => !prev)}
                >
                  <ChevronRight
                    className="w-3 h-3 transition-transform shrink-0"
                    style={{
                      transform: moreExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                  <span>
                    {t("moreWorkspaces", { count: moreCount })}
                  </span>
                </button>

                {moreExpanded && (
                  <div className="flex flex-col gap-0.5 pl-1">
                    {/* Unpinned visible */}
                    {unpinnedVisible.map((ws) => (
                      <WorkspaceRow
                        key={ws.id}
                        workspace={ws}
                        isActive={ws.id === expandedWorkspaceId}
                        onSelect={handleSelect}
                        onTogglePin={handleTogglePin}
                        onToggleHidden={handleToggleHidden}
                      />
                    ))}

                    {/* Hidden */}
                    {hidden.map((ws) => (
                      <WorkspaceRow
                        key={ws.id}
                        workspace={ws}
                        isActive={ws.id === expandedWorkspaceId}
                        onSelect={handleSelect}
                        onTogglePin={handleTogglePin}
                        onToggleHidden={handleToggleHidden}
                        dimmed
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
