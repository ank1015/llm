"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { TypewriterSessionName } from "@/components/typewriter-session-name";
import { useArtifactDirsQuery, useProjectQuery } from "@/hooks/api/projects";
import { useSessionQuery } from "@/hooks/api/sessions";
import { useSidebarStore } from "@/stores/sidebar-store";

function formatProjectName(name: string): string {
  if (!name) {
    return name;
  }

  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function Delimiter() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center leading-none text-black/38 dark:text-white/38"
    >
      &gt;
    </span>
  );
}

function SessionCrumb({
  projectId,
  artifactId,
  sessionId,
}: {
  projectId: string;
  artifactId: string;
  sessionId: string;
}) {
  const artifactDirs = useSidebarStore((state) => state.artifactDirs);
  const sidebarSessionName =
    artifactDirs
      .find((artifact) => artifact.id === artifactId)
      ?.sessions.find((session) => session.sessionId === sessionId)?.sessionName ?? null;
  const session = useSessionQuery({ projectId, artifactId }, sessionId).data;
  const sessionName = sidebarSessionName ?? session?.name ?? sessionId;

  return (
    <>
      <Delimiter />
      <Link
        href={`/${projectId}/${artifactId}/${sessionId}`}
        className="min-w-0 truncate font-medium leading-none text-black transition-colors hover:text-black/68 dark:text-white dark:hover:text-white/72"
      >
        <TypewriterSessionName name={sessionName} />
      </Link>
    </>
  );
}

export function ProjectHeaderBreadcrumb() {
  const { projectId, artifactId, sessionId } = useParams<{
    projectId: string;
    artifactId?: string;
    sessionId?: string;
  }>();
  const project = useProjectQuery(projectId).data;
  const projectName = formatProjectName(project?.name ?? projectId);
  const artifacts = useArtifactDirsQuery(projectId).data ?? [];
  const artifactName = artifactId
    ? (artifacts.find((artifact) => artifact.id === artifactId)?.name ?? artifactId)
    : null;

  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm">
      <Link
        href="/"
        className="shrink-0 font-medium leading-none text-black transition-colors hover:text-black/68 dark:text-white dark:hover:text-white/72"
      >
        Projects
      </Link>
      <Delimiter />
      <Link
        href={`/${projectId}`}
        className="min-w-0 truncate font-medium leading-none text-black transition-colors hover:text-black/68 dark:text-white dark:hover:text-white/72"
      >
        {projectName}
      </Link>
      <Delimiter />

      {artifactId ? (
        <>
          <Link
            href={`/${projectId}/${artifactId}`}
            className="min-w-0 truncate font-medium leading-none text-black transition-colors hover:text-black/68 dark:text-white dark:hover:text-white/72"
          >
            {artifactName}
          </Link>
          {sessionId ? (
            <SessionCrumb projectId={projectId} artifactId={artifactId} sessionId={sessionId} />
          ) : (
            <Delimiter />
          )}
        </>
      ) : null}
    </div>
  );
}
