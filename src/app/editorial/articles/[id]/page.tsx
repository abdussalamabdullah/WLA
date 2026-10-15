import Link from "next/link";
import { notFound } from "next/navigation";

import { FormNotice } from "@/components/ui/field";
import { History } from "@/components/journal/studio/history";
import { RevisionEditor } from "@/components/journal/studio/revision-editor";
import { CommentsPanel, ImagesPanel, PeoplePanel } from "@/components/journal/studio/side-panels";
import { JournalStatus } from "@/components/journal/studio/status";
import { WorkflowPanel } from "@/components/journal/studio/workflow-panel";
import { getCategories, getSchedulerStatus, getStaffDirectory, getStudioArticle } from "@/features/journal/queries";
import { isEditable, REVISION_LABEL } from "@/features/journal/status";
import { requireJournalStaff } from "@/lib/permissions/journal";

export const metadata = { title: "Article · Journal studio" };

const UUID = /^[0-9a-f-]{36}$/;

/**
 * ONE ARTICLE IN THE STUDIO. Everything here is read through RLS as the
 * signed-in person, so a writer who opens someone else's article id — or a
 * reviewer who is not assigned — gets the same "not found" as a bad id.
 */
export default async function StudioArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const { caps, user } = await requireJournalStaff();
  const [data, staff, categories, scheduler] = await Promise.all([getStudioArticle(id), getStaffDirectory(), getCategories(), getSchedulerStatus()]);
  if (!data) notFound();

  const { article, working, live, revisions, members, assignments, decisions, comments, changes, audit, media, status } = data;
  const people = new Map(staff.map((p) => [p.profile_id, p.name || p.email]));
  const nameOf = (pid: string | null) => (pid ? people.get(pid) ?? "Former staff" : "Someone");
  const me = user.id;
  const isMember = members.some((m) => m.profile_id === me);
  const canEdit = caps.isEditor || (caps.canWrite && isMember);
  const isAuthor = members.some((m) => m.profile_id === me && m.role === "author");
  // D-130: editors, or a writer who is this article's author, publish. No approval needed.
  const canPublish = caps.isEditor || (caps.canWrite && members.some((m) => m.profile_id === me && m.role === "author"));
  const scheduledRev = revisions.find((r) => r.id === article.scheduled_revision_id);
  const archived = Boolean(article.archived_at);
  const scheduledLocked = Boolean(working && article.scheduled_revision_id === working.id);
  const editable = Boolean(working && isEditable(working.state) && canEdit && !archived && !scheduledLocked);
  const title = working?.title || live?.title || "Untitled";

  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <Link href="/editorial" className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
        ← All articles
      </Link>
      <div className="mt-[var(--space-m)] flex flex-wrap items-start justify-between gap-[var(--space-m)]">
        <div className="min-w-0">
          <h1 className="text-[length:var(--text-h1)]">{title}</h1>
          <div className="mt-[var(--space-s)]"><JournalStatus status={status.status} pending={status.pending} /></div>
          {working && (
            <p className="mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Working on version {working.number} · {REVISION_LABEL[working.state]}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-[var(--space-m)]">
          {working && (
            <Link href={`/editorial/articles/${id}/preview?revision=${working.id}`} className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
              Preview version {working.number}
            </Link>
          )}
          {live && (
            <Link href={`/journal/${live.slug}`} className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
              View the live article
            </Link>
          )}
        </div>
      </div>
      {sp.notice === "slug" && (
        <div className="mt-[var(--space-m)]"><FormNotice message="Another article already uses the URL made from this title, so this one has no URL slug yet. Choose one before submitting." /></div>
      )}

      <div className="mt-[var(--space-xl)] grid gap-[var(--space-2xl)] lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="content-h" className="min-w-0">
          <h2 id="content-h" className="text-[length:var(--text-h2)]">Content</h2>
          <div className="mt-[var(--space-m)]">
            {editable && working ? (
              <RevisionEditor
                key={working.id}
                articleId={id}
                revision={working}
                categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                media={media.map((m) => ({ id: m.id, alt: m.alt_text }))}
              />
            ) : (
              <p className="wla-measure text-[var(--color-text-muted)]">
                {archived
                  ? "Archived articles can't be edited."
                  : scheduledLocked
                    ? "This version is scheduled to publish and is locked. Cancel the schedule to change it."
                  : !canEdit
                    ? "You can read and comment on this article, but not edit it."
                    : working?.state === "in_review"
                      ? "This version is in review and locked."
                      : "This version is locked. Start a new version to make changes."}{" "}
                {working && (
                  <Link href={`/editorial/articles/${id}/preview?revision=${working.id}`} className="underline underline-offset-4">Read version {working.number}</Link>
                )}
              </p>
            )}
          </div>
        </section>

        <aside aria-label="Workflow, people and comments" className="flex min-w-0 flex-col gap-[var(--space-2xl)]">
          <section aria-labelledby="workflow-h">
            <h2 id="workflow-h" className="text-[length:var(--text-h2)]">Workflow</h2>
            <div className="mt-[var(--space-m)]">
              <WorkflowPanel
                articleId={id}
                caps={caps}
                canEdit={canEdit}
                canPublish={canPublish}
                archived={archived}
                everPublished={Boolean(article.first_published_at)}
                live={live ? { id: live.id, number: live.number, slug: live.slug } : null}
                working={working ? { id: working.id, number: working.number, state: working.state, contentHash: working.content_hash } : null}
                scheduled={article.scheduled_for ? { revisionNumber: scheduledRev?.number ?? null, at: article.scheduled_for, by: nameOf(article.scheduled_by) } : null}
                scheduler={scheduler ? { configured: scheduler.configured, active: scheduler.active, lastRunAt: scheduler.last_run_at, lastStatus: scheduler.last_status, overdue: scheduler.overdue } : null}
                reviewers={assignments.map((a) => ({ id: a.reviewer_id, name: nameOf(a.reviewer_id) }))}
                reviewerChoices={staff.filter((p) => p.is_admin || p.roles.includes("reviewer") || p.roles.includes("editor")).map((p) => ({ id: p.profile_id, name: p.name || p.email }))}
                isAssignedReviewer={caps.canReview && assignments.some((a) => a.reviewer_id === me)}
                editedWorkingRevision={Boolean(working && changes.some((c) => c.revision_id === working.id && c.actor_id === me))}
              />
            </div>
          </section>
          <PeoplePanel
            articleId={id}
            members={members.map((m) => ({ id: m.profile_id, name: nameOf(m.profile_id), role: m.role }))}
            writers={staff.filter((p) => p.is_admin || p.roles.includes("writer") || p.roles.includes("editor")).map((p) => ({ id: p.profile_id, name: p.name || p.email }))}
            canManage={!archived && (caps.isEditor || isAuthor)}
          />
          <ImagesPanel articleId={id} canEdit={canEdit && !archived} media={media.map((m) => ({ id: m.id, alt: m.alt_text, isPublic: m.is_public }))} />
          <CommentsPanel
            articleId={id}
            revisionId={working?.id ?? null}
            comments={comments.map((c) => ({
              id: c.id,
              parentId: c.parent_id,
              author: nameOf(c.author_id),
              body: c.body,
              anchor: c.anchor,
              revisionNumber: revisions.find((r) => r.id === c.revision_id)?.number ?? null,
              createdAt: c.created_at,
              resolved: Boolean(c.resolved_at),
              canResolve: canEdit || c.author_id === me,
            }))}
          />
        </aside>
      </div>

      <section aria-labelledby="history-h" className="mt-[var(--space-3xl)] border-t border-[var(--color-border)] pt-[var(--space-xl)]">
        <h2 id="history-h" className="text-[length:var(--text-h2)]">History</h2>
        <div className="mt-[var(--space-m)]">
          <History articleId={id} revisions={revisions} changes={changes} decisions={decisions} audit={audit} nameOf={nameOf} />
        </div>
      </section>
    </main>
  );
}
