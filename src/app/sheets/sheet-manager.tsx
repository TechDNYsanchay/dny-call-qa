"use client";

// One call sheet on the Call sheets page: upload a new PDF (read into a draft) or edit the
// current questions, check them, and publish them as the next version.

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Card } from "@/components/ui";
import type { SheetQuestion, Stream } from "@/lib/scoring/call-sheets";
import { publishSheet, readSheetPdf, type DraftState, type PublishState } from "./actions";

const SECTIONS = ["vision", "business", "money", "decision"] as const;
const INPUT = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";
const BUTTON = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-background disabled:opacity-60";
const PRIMARY = "rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60";

interface Props {
  stream: Stream;
  currentLabel: string;
  currentQuestions: SheetQuestion[];
  nextVersion: number;
}

export function SheetManager({ stream, currentLabel, currentQuestions, nextVersion }: Props) {
  const [upload, uploadAction, reading] = useActionState<DraftState, FormData>(readSheetPdf, {});
  const [editingCurrent, setEditingCurrent] = useState(false);
  const [published, setPublished] = useState<PublishState["published"]>();
  const [closedDraft, setClosedDraft] = useState<string | null>(null);

  const draft = upload.draft && upload.draft.storagePath !== closedDraft ? upload.draft : null;
  const editor = draft
    ? { key: draft.storagePath, questions: draft.questions, storagePath: draft.storagePath, source: `Read from ${draft.fileName}. Check every line before publishing.` }
    : editingCurrent
      ? { key: "current", questions: currentQuestions, storagePath: "", source: `Editing ${currentLabel}. The current PDF stays attached.` }
      : null;

  const close = () => {
    if (draft) setClosedDraft(draft.storagePath);
    setEditingCurrent(false);
  };

  return (
    <div className="space-y-3">
      {published && (
        <p className="rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm">
          Published version {published.version}, “{published.label}”. Calls scored from now on use it.
        </p>
      )}
      {!editor && (
        <div className="flex flex-wrap items-end gap-3">
          <form action={uploadAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="stream" value={stream} />
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">New PDF of this sheet</span>
              <input type="file" name="pdf" accept="application/pdf" required className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
            </label>
            <button type="submit" disabled={reading} className={PRIMARY}>
              {reading ? "Reading the PDF…" : "Read the questions"}
            </button>
          </form>
          <span className="text-sm text-muted">or</span>
          <button type="button" onClick={() => setEditingCurrent(true)} className={BUTTON}>
            Edit the current questions
          </button>
        </div>
      )}
      {upload.error && !editor && <p className="text-sm text-critical">{upload.error}</p>}
      {editor && (
        <SheetEditor
          key={editor.key}
          stream={stream}
          initial={editor.questions}
          storagePath={editor.storagePath}
          source={editor.source}
          nextVersion={nextVersion}
          onCancel={close}
          onPublished={(p) => {
            setPublished(p);
            close();
          }}
        />
      )}
    </div>
  );
}

interface Row extends Omit<SheetQuestion, "id" | "number"> {
  key: number;
}

function SheetEditor({
  stream,
  initial,
  storagePath,
  source,
  nextVersion,
  onCancel,
  onPublished,
}: {
  stream: Stream;
  initial: SheetQuestion[];
  storagePath: string;
  source: string;
  nextVersion: number;
  onCancel: () => void;
  onPublished: (p: NonNullable<PublishState["published"]>) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((q, i) => ({ question: q.question, captures: q.captures, priority: q.priority, runningBusinessOnly: q.runningBusinessOnly, section: q.section, key: i })),
  );
  const [state, action, pending] = useActionState<PublishState, FormData>(async (prev, form) => {
    const result = await publishSheet(prev, form);
    if (result.published) {
      onPublished(result.published);
      router.refresh();
    }
    return result;
  }, {});

  const prefix = stream === "first_call" ? "fc" : "lc";
  // Numbers follow the order, as printed on the sheet.
  const questions: SheetQuestion[] = rows.map((r, i) => ({
    id: `${prefix}${String(i + 1).padStart(2, "0")}`,
    number: i + 1,
    question: r.question.trim(),
    captures: r.captures.trim(),
    priority: r.priority,
    runningBusinessOnly: r.runningBusinessOnly,
    ...(r.section ? { section: r.section } : {}),
  }));
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, by: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(rs.length - 1, index + by)), 0, row);
      return next;
    });
  const add = () =>
    setRows((rs) => [...rs, { key: Math.max(-1, ...rs.map((r) => r.key)) + 1, question: "", captures: "", priority: "must", runningBusinessOnly: false }]);

  return (
    <Card className="border-brand/40">
      <p className="mb-4 text-sm text-muted">{source}</p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="stream" value={stream} />
        <input type="hidden" name="storagePath" value={storagePath} />
        <input type="hidden" name="questions" value={JSON.stringify(questions)} />
        <ol className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.key} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className={BUTTON}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" className={BUTTON}>
                    ↓
                  </button>
                  <button type="button" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} className={BUTTON}>
                    Remove
                  </button>
                </div>
              </div>
              <label className="mb-2 block">
                <span className="sr-only">Question {i + 1}</span>
                <input value={row.question} onChange={(e) => update(row.key, { question: e.target.value })} required minLength={3} placeholder="The question" className={INPUT} />
              </label>
              <label className="mb-2 block">
                <span className="mb-1 block text-xs text-muted">What it captures</span>
                <input value={row.captures} onChange={(e) => update(row.key, { captures: e.target.value })} placeholder="e.g. name · city · phone · email" className={INPUT} />
              </label>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <select value={row.priority} onChange={(e) => update(row.key, { priority: e.target.value as Row["priority"] })} aria-label="Priority" className="rounded-md border border-border bg-surface px-2 py-1">
                  <option value="must">Must capture</option>
                  <option value="good_to_have">Good to have</option>
                </select>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={row.runningBusinessOnly} onChange={(e) => update(row.key, { runningBusinessOnly: e.target.checked })} />
                  Running business only (RB)
                </label>
                {stream === "vision_call" && (
                  <select
                    value={row.section ?? ""}
                    onChange={(e) => update(row.key, { section: (e.target.value || undefined) as Row["section"] })}
                    aria-label="Section"
                    className="rounded-md border border-border bg-surface px-2 py-1"
                  >
                    <option value="">No section</option>
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s[0].toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={add} className={BUTTON}>
          Add a question
        </button>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">Name of this version</span>
            <input name="label" required minLength={3} placeholder={stream === "first_call" ? "FC-01 (Nov 2026)" : "LC-01 (Nov 2026)"} className={INPUT} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">What changed (optional)</span>
            <input name="notes" placeholder="e.g. Added a question on delivery platforms" className={INPUT} />
          </label>
        </div>
        {state.error && <p className="text-sm text-critical">{state.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || rows.length === 0} className={PRIMARY}>
            {pending ? "Publishing…" : `Publish as version ${nextVersion}`}
          </button>
          <button type="button" onClick={onCancel} className={BUTTON}>
            Cancel
          </button>
        </div>
        <p className="text-xs text-muted">
          Calls scored after you publish use these questions; calls already scored keep the version they were scored against.
        </p>
      </form>
    </Card>
  );
}
