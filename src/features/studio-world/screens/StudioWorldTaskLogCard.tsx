"use client";

import { useEffect, useState } from "react";

import type { StudioProjectRecord } from "@/lib/studio-world/types";

type StudioWorldLogResponse = {
  taskLog?: string;
  error?: string;
};

const shouldPollExternalModel = (externalModel?: StudioProjectRecord["externalModel"] | null) =>
  externalModel?.status === "pending" ||
  externalModel?.status === "in_progress" ||
  (externalModel?.status === "completed" && !externalModel.glbUrl?.trim());

const fetchProjectTaskLog = async (projectId: string) => {
  const response = await fetch(
    `/api/studio-world?action=task-log&projectId=${encodeURIComponent(projectId)}`,
    { cache: "no-store" },
  );
  const body = (await response.json()) as StudioWorldLogResponse;
  if (!response.ok) {
    throw new Error(body.error || "Failed to load task log.");
  }
  return typeof body.taskLog === "string" ? body.taskLog : "";
};

const formatTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const useStudioTaskLog = (project: StudioProjectRecord) => {
  const [taskLog, setTaskLog] = useState("");
  const [taskLogError, setTaskLogError] = useState<string | null>(null);
  const [taskLogUpdatedAt, setTaskLogUpdatedAt] = useState<string | null>(null);
  const taskId = project.externalModel?.taskId ?? null;
  const shouldPollTaskLog = shouldPollExternalModel(project.externalModel);

  useEffect(() => {
    if (!project.id || !taskId) return;
    let cancelled = false;
    const pollTaskLog = async () => {
      try {
        const nextTaskLog = await fetchProjectTaskLog(project.id);
        if (cancelled) return;
        setTaskLog(nextTaskLog);
        setTaskLogError(null);
        setTaskLogUpdatedAt(new Date().toISOString());
      } catch (loadError) {
        if (cancelled) return;
        setTaskLogError(
          loadError instanceof Error ? loadError.message : "Failed to load task log.",
        );
      }
    };
    void pollTaskLog();
    if (!shouldPollTaskLog) {
      return () => {
        cancelled = true;
      };
    }
    const intervalId = window.setInterval(() => {
      void pollTaskLog();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [project.id, shouldPollTaskLog, taskId]);

  return {
    taskLog,
    taskLogError,
    taskLogUpdatedAt,
  };
};

const StudioWorldTaskLogBody = (props: {
  project: StudioProjectRecord;
  taskLog: string;
  taskLogError: string | null;
  taskLogUpdatedAt: string | null;
}) => {
  if (!props.project.externalModel) {
    return (
      <div className="text-sm text-muted-foreground">
        Start an image-to-3D generation to see stage-by-stage backend logs here.
      </div>
    );
  }
  if (props.taskLogError) {
    return <div className="text-sm text-destructive">{props.taskLogError}</div>;
  }
  if (!props.taskLog.trim()) {
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <div>No backend log lines have arrived yet.</div>
        <div>
          Status: <span className="font-medium text-foreground">{props.project.externalModel.status}</span>
          {" "}at{" "}
          <span className="font-medium text-foreground">{props.project.externalModel.progress}%</span>.
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          Task id: {props.project.externalModel.taskId}
        </div>
        <div className="text-xs text-muted-foreground">
          If this status and percentage do not change for a while, the job is likely stuck.
        </div>
        {props.taskLogUpdatedAt ? (
          <div className="text-xs text-muted-foreground">
            Last checked {formatTimestamp(props.taskLogUpdatedAt)}.
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-muted-foreground">
      {props.taskLog.trim()}
    </pre>
  );
};

export function StudioWorldTaskLogCard({ project }: { project: StudioProjectRecord }) {
  const { taskLog, taskLogError, taskLogUpdatedAt } = useStudioTaskLog(project);

  return (
    <div className="ui-card min-h-0 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Live task log
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {project.externalModel
              ? `Streaming worker debug output for ${project.externalModel.status}.`
              : "No self-hosted AI task has been created for this project yet."}
          </div>
        </div>
        {taskLogUpdatedAt ? (
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Updated {formatTimestamp(taskLogUpdatedAt)}
          </div>
        ) : null}
      </div>
      <div className="mt-3 rounded-xl border border-border/60 bg-black/25 p-3">
        <StudioWorldTaskLogBody
          project={project}
          taskLog={taskLog}
          taskLogError={taskLogError}
          taskLogUpdatedAt={taskLogUpdatedAt}
        />
      </div>
    </div>
  );
}
