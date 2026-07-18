"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save, Search, Tags } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError, apiFetch } from "@/lib/api";

export interface TaggingTopic {
  id: string;
  subject: string;
  name: string;
  topicGroup?: string;
}

interface RubricTaggingItem {
  id: string;
  content: string;
  position: number;
  topicIds: string[];
}

export interface TaggingContext {
  question: {
    id: string;
    content: string;
    subject: string;
    gradeLevel?: string;
    questionType: "multiple_choice" | "essay";
  };
  rubricItems: RubricTaggingItem[];
  availableTopics: TaggingTopic[];
  directTopicIds: string[];
  effectiveTopics: TaggingTopic[];
  version: number;
  updatedBy?: string;
  updatedAt: string;
}

interface QuestionTaggingPanelProps {
  questionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (context: TaggingContext) => void;
}

export default function QuestionTaggingPanel({
  questionId,
  open,
  onOpenChange,
  onSaved,
}: QuestionTaggingPanelProps) {
  const [context, setContext] = useState<TaggingContext | null>(null);
  const [directTopicIds, setDirectTopicIds] = useState<string[]>([]);
  const [rubricTopicIds, setRubricTopicIds] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const applyContext = (next: TaggingContext) => {
    setContext(next);
    setDirectTopicIds(next.directTopicIds);
    setRubricTopicIds(
      Object.fromEntries(next.rubricItems.map((item) => [item.id, item.topicIds])),
    );
    onSaved?.(next);
  };

  const loadContext = async () => {
    if (!questionId) return;
    setLoading(true);
    try {
      const next = await apiFetch(
        `/teacher/question-bank/questions/${questionId}/tagging-context`,
      );
      applyContext(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tải dữ liệu gắn topic.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !questionId) {
      setContext(null);
      setSearch("");
      return;
    }
    void loadContext();
    // Loading is intentionally keyed only by the selected question and open state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, questionId]);

  const visibleTopics = useMemo(() => {
    if (!context) return [];
    const needle = search.trim().toLocaleLowerCase("vi");
    if (!needle) return context.availableTopics;
    return context.availableTopics.filter((topic) =>
      `${topic.name} ${topic.topicGroup || ""}`.toLocaleLowerCase("vi").includes(needle),
    );
  }, [context, search]);

  const toggleTopic = (
    selected: string[],
    topicId: string,
    setter: (next: string[]) => void,
  ) => {
    setter(
      selected.includes(topicId)
        ? selected.filter((id) => id !== topicId)
        : [...selected, topicId],
    );
  };

  const handleConflict = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409 && error.latestContext) {
      applyContext(error.latestContext as TaggingContext);
      toast.warning("Dữ liệu vừa được giáo viên khác cập nhật. Hãy kiểm tra và chọn lại.");
      return true;
    }
    return false;
  };

  const saveDirectTopics = async () => {
    if (!questionId || !context) return;
    setSavingKey("direct");
    try {
      const next = await apiFetch(
        `/teacher/question-bank/questions/${questionId}/topics`,
        {
          method: "PUT",
          body: JSON.stringify({
            topicIds: directTopicIds,
            expectedVersion: context.version,
          }),
        },
      );
      applyContext(next);
      toast.success("Đã lưu topic cấp câu hỏi.");
    } catch (error) {
      if (!handleConflict(error)) {
        toast.error(error instanceof Error ? error.message : "Không thể lưu topic.");
      }
    } finally {
      setSavingKey(null);
    }
  };

  const saveRubricTopics = async (rubricItemId: string) => {
    if (!questionId || !context) return;
    setSavingKey(rubricItemId);
    try {
      const next = await apiFetch(
        `/teacher/question-bank/questions/${questionId}/rubric-items/${rubricItemId}/topics`,
        {
          method: "PUT",
          body: JSON.stringify({
            topicIds: rubricTopicIds[rubricItemId] || [],
            expectedVersion: context.version,
          }),
        },
      );
      applyContext(next);
      toast.success("Đã lưu topic cho ý barem.");
    } catch (error) {
      if (!handleConflict(error)) {
        toast.error(error instanceof Error ? error.message : "Không thể lưu topic barem.");
      }
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-xl [&>button]:bg-emerald-600 [&>button]:text-white [&>button]:opacity-100 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:hover:bg-emerald-700 [&>button]:hover:scale-105 [&>button]:transition-all [&>button]:focus:ring-emerald-500 [&>button]:border [&>button]:border-emerald-500/20 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button>svg]:text-white [&>button>svg]:h-3.5 [&>button>svg]:w-3.5">
        <SheetHeader className="border-b border-border bg-slate-950 px-6 py-5 pr-12 text-left text-white">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
            <Tags size={14} />
            Bản đồ kiến thức
          </div>
          <SheetTitle className="line-clamp-2 text-base font-black text-white">
            {context?.question.content || "Gắn topic cho câu hỏi"}
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-300">
            Chọn topic cùng môn. Hệ thống chỉ tổng hợp các tag bạn chọn, không tự mở rộng
            sang topic cha hoặc tiên quyết.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="animate-spin" size={18} />
              Đang tải ngữ cảnh tagging…
            </div>
          </div>
        ) : !context ? (
          <div className="grid flex-1 place-items-center px-8 text-center">
            <div>
              <p className="text-sm font-bold">Chưa tải được dữ liệu tagging.</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={loadContext}>
                <RefreshCw />
                Tải lại
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border bg-emerald-50/70 px-6 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-800">
                    Topic hiệu lực · phiên bản {context.version}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {context.effectiveTopics.length ? (
                      context.effectiveTopics.map((topic) => (
                        <Badge key={topic.id} className="bg-emerald-700 text-white">
                          {topic.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs font-semibold text-emerald-900/60">
                        Chưa có topic hiệu lực
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 border-emerald-300 bg-white">
                  {context.question.subject}
                </Badge>
              </div>
            </div>

            <div className="relative px-6 py-4">
              <Search
                size={15}
                className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm topic hoặc nhóm kiến thức…"
                className="pl-9"
              />
            </div>

            <ScrollArea className="flex-1 px-6">
              <TopicGroup
                title="Toàn bộ câu hỏi"
                description={
                  context.question.questionType === "essay"
                    ? "Topic bổ sung ở cấp câu hỏi"
                    : "Toàn bộ topic của câu trắc nghiệm"
                }
                topics={visibleTopics}
                selected={directTopicIds}
                disabled={savingKey !== null}
                onToggle={(topicId) =>
                  toggleTopic(directTopicIds, topicId, setDirectTopicIds)
                }
                action={
                  <Button
                    size="sm"
                    onClick={saveDirectTopics}
                    disabled={savingKey !== null}
                  >
                    {savingKey === "direct" ? <Loader2 className="animate-spin" /> : <Save />}
                    Lưu
                  </Button>
                }
              />

              {context.rubricItems.map((rubric) => (
                <TopicGroup
                  key={rubric.id}
                  title={`Ý ${rubric.position + 1}`}
                  description={rubric.content}
                  topics={visibleTopics}
                  selected={rubricTopicIds[rubric.id] || []}
                  disabled={savingKey !== null}
                  onToggle={(topicId) =>
                    toggleTopic(rubricTopicIds[rubric.id] || [], topicId, (next) =>
                      setRubricTopicIds((current) => ({ ...current, [rubric.id]: next })),
                    )
                  }
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveRubricTopics(rubric.id)}
                      disabled={savingKey !== null}
                    >
                      {savingKey === rubric.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Save />
                      )}
                      Lưu ý barem
                    </Button>
                  }
                />
              ))}
              <div className="h-6" />
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface TopicGroupProps {
  title: string;
  description: string;
  topics: TaggingTopic[];
  selected: string[];
  disabled: boolean;
  onToggle: (topicId: string) => void;
  action: React.ReactNode;
}

function TopicGroup({
  title,
  description,
  topics,
  selected,
  disabled,
  onToggle,
  action,
}: TopicGroupProps) {
  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wide text-foreground">{title}</h3>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </div>
      <div className="grid gap-1 p-2">
        {topics.length ? (
          topics.map((topic) => {
            const checked = selected.includes(topic.id);
            return (
              <label
                key={topic.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${checked
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-transparent hover:border-border hover:bg-muted/50"
                  }`}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={() => onToggle(topic.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-foreground">
                    {topic.name}
                  </span>
                  <span className="block truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {topic.topicGroup || "Chủ đề chung"}
                  </span>
                </span>
              </label>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-xs font-semibold text-muted-foreground">
            Không có topic phù hợp với từ khóa.
          </p>
        )}
      </div>
    </section>
  );
}
