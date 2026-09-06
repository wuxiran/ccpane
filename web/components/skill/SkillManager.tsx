import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2, CodeXml, Wand2, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSkillStore } from "@/stores";
import SkillEditor from "./SkillEditor";
import LinkSkillManager from "./LinkSkillManager";

interface SkillManagerProps {
  projectPath: string;
}

export default function SkillManager({ projectPath }: SkillManagerProps) {
  const { t } = useTranslation("dialogs");
  const { t: tNotify } = useTranslation("notifications");

  const skills = useSkillStore((s) => s.skills);
  const activeSkill = useSkillStore((s) => s.activeSkill);
  const loading = useSkillStore((s) => s.loading);
  const loadSkills = useSkillStore((s) => s.loadSkills);
  const selectSkill = useSkillStore((s) => s.selectSkill);
  const saveSkill = useSkillStore((s) => s.saveSkill);
  const deleteSkill = useSkillStore((s) => s.deleteSkill);
  const clearActiveSkill = useSkillStore((s) => s.clearActiveSkill);

  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"project" | "link">("project");

  useEffect(() => {
    loadSkills(projectPath);
    return () => clearActiveSkill();
  }, [projectPath, loadSkills, clearActiveSkill]);

  const handleSelect = useCallback(
    (name: string) => {
      setIsCreating(false);
      selectSkill(projectPath, name);
    },
    [projectPath, selectSkill]
  );

  const handleNew = useCallback(() => {
    clearActiveSkill();
    setIsCreating(true);
  }, [clearActiveSkill]);

  const handleSave = useCallback(
    async (name: string, content: string) => {
      try {
        await saveSkill(projectPath, name, content);
        setIsCreating(false);
        toast.success(tNotify("skillSaved"));
      } catch (e) {
        toast.error(tNotify("operationFailed", { error: String(e) }));
      }
    },
    [projectPath, saveSkill]
  );

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await deleteSkill(projectPath, name);
        toast.success(tNotify("skillDeleted"));
      } catch (e) {
        toast.error(tNotify("operationFailed", { error: String(e) }));
      }
    },
    [projectPath, deleteSkill]
  );

  const handleCancel = useCallback(() => {
    setIsCreating(false);
    clearActiveSkill();
  }, [clearActiveSkill]);

  const showEditor = isCreating || activeSkill;

  return (
    <div className="flex h-full flex-col">
      {/* 顶部页签：项目 Skills / 链接管理（中央仓库 + 多 Agent 启停） */}
      <div className="flex items-center gap-1 border-b border-border bg-card px-3 py-1.5">
        <button
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            activeTab === "project"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
          onClick={() => setActiveTab("project")}
        >
          项目 Skills
        </button>
        <button
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            activeTab === "link"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
          onClick={() => setActiveTab("link")}
        >
          链接管理（中央仓库）
        </button>
      </div>

      {activeTab === "link" ? (
        <LinkSkillManager />
      ) : (
        <div className="relative flex flex-1 overflow-hidden">
          {/* 左侧列表 */}
          <div className="flex w-64 flex-shrink-0 flex-col border-r border-border">
            {/* 列表标题 */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Wand2 size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">{t("skillTitle")}</span>
                <Badge variant="secondary" className="text-xs">
                  {skills.length}
                </Badge>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleNew}>
                <Plus size={14} />
              </Button>
            </div>

            {/* 列表内容 */}
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  <span>{t("loading", { ns: "common" })}</span>
                </div>
              )}

              {!loading && skills.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  <Sparkles size={28} className="mx-auto mb-3 opacity-40" />
                  <p className="text-xs">{t("noSkills")}</p>
                  <p className="mt-1 text-xs">{t("clickToCreate")}</p>
                </div>
              )}

              {skills.map((skill) => (
                <div
                  key={skill.name}
                  className={`group flex cursor-pointer items-center gap-2 border-b border-border/50 px-3 py-2 transition-colors hover:bg-accent/50 ${
                    activeSkill?.name === skill.name ? "bg-accent" : ""
                  }`}
                  onClick={() => handleSelect(skill.name)}
                >
                  <CodeXml size={14} className="flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">/{skill.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {skill.preview}
                    </div>
                  </div>
                  <div className="hidden items-center gap-1 group-hover:flex">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(skill.name);
                      }}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧编辑器 */}
          <div className="flex-1 overflow-hidden">
            {showEditor ? (
              <SkillEditor
                name={isCreating ? "" : activeSkill?.name ?? ""}
                content={isCreating ? "" : activeSkill?.content ?? ""}
                isNew={isCreating}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Sparkles size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">{t("selectOrCreateSkill")}</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">{t("skillDesc")}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
