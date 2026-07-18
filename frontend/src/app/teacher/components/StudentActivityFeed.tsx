"use client";

interface ActivityLog {
  id: string;
  nodeName: string;
  action: string;
  detail: string;
  createdAt: string;
}

export default function StudentActivityFeed({ logs }: { logs: ActivityLog[] }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3.5">Log chi tiết hoạt động</h3>
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {logs.length > 0 ? logs.map((log) => {
          const isCorrect = log.action === "answer_correct";
          const needsAttention = log.action === "answer_incorrect" || log.action === "click_cant_do";
          return (
            <div key={log.id} className="p-3 bg-muted border border-border rounded-2xl text-[11px] leading-relaxed space-y-1 shadow-sm">
              <div className="flex justify-between items-start gap-2">
                <span className="font-black text-foreground">{log.nodeName}</span>
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${isCorrect ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : needsAttention ? "bg-rose-50 text-rose-600 border border-rose-200" : "bg-blue-50 text-blue-600 border border-blue-200"}`}>
                  {log.action}
                </span>
              </div>
              <p className="text-muted-foreground font-medium">{log.detail}</p>
              <div className="text-[9px] text-muted-foreground font-semibold">{new Date(log.createdAt).toLocaleString("vi-VN")}</div>
            </div>
          );
        }) : (
          <div className="text-center py-12 text-muted-foreground text-xs font-bold border border-dashed border-border rounded-2xl">
            Chưa ghi nhận hoạt động nào của học sinh.
          </div>
        )}
      </div>
    </div>
  );
}
