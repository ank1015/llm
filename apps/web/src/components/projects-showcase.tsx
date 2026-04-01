"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";

import {
  ArchiveArrowDownIcon,
  ArchiveArrowUpIcon,
  Delete03Icon,
  ImageAdd02Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import {
  useDeleteProjectMutation,
  useProjectsQuery,
  useRenameProjectMutation,
  useToggleProjectArchiveMutation,
  useUpdateProjectImageMutation,
} from "@/hooks/api";

import type { ProjectDto } from "@/lib/client-api";

type ProjectAction = "cover" | "rename" | "archive" | "delete";

type ActiveProjectDialog =
  | {
      action: ProjectAction;
      project: ProjectDto;
    }
  | null;

type ProjectVisibilityFilter = "active" | "archived";

const MENU_WIDTH = 176;
const MENU_HEIGHT = 144;
const MENU_OFFSET = 8;
const VIEWPORT_PADDING = 12;

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read image file."));
    };
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function formatProjectName(name: string): string {
  if (!name) {
    return name;
  }

  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function ProjectActionsMenu({
  project,
  projectName,
  onSelectAction,
}: {
  project: ProjectDto;
  projectName: string;
  onSelectAction: (action: ProjectAction) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = [
    { label: "Update cover", icon: ImageAdd02Icon, action: "cover" },
    { label: "Rename", icon: PencilEdit01Icon, action: "rename" },
    {
      label: project.archived ? "Unarchive" : "Archive",
      icon: project.archived ? ArchiveArrowUpIcon : ArchiveArrowDownIcon,
      action: "archive",
    },
    { label: "Delete", icon: Delete03Icon, action: "delete" },
  ] as const;

  function updateMenuPosition() {
    if (typeof window === "undefined" || !triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const shouldOpenAbove =
      viewportHeight - rect.bottom < MENU_HEIGHT + MENU_OFFSET &&
      rect.top > MENU_HEIGHT + MENU_OFFSET;

    const top = shouldOpenAbove
      ? Math.max(VIEWPORT_PADDING, rect.top - MENU_HEIGHT - MENU_OFFSET)
      : Math.min(
          viewportHeight - MENU_HEIGHT - VIEWPORT_PADDING,
          rect.bottom + MENU_OFFSET,
        );
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(rect.right - MENU_WIDTH, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING),
    );

    setMenuPosition({ top, left });
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    updateMenuPosition();
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen]);

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More options for ${projectName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }

          updateMenuPosition();
          setIsOpen(true);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-black/42 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/46 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-white/12"
      >
        <HugeiconsIcon
          icon={MoreHorizontalIcon}
          size={17}
          color="currentColor"
          strokeWidth={1.9}
        />
      </button>

      {isOpen && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${projectName}`}
              className="fixed z-50 w-44 overflow-hidden rounded-2xl border border-black/8 bg-white p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#171717] dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
              }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    onSelectAction(item.action);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.83rem] font-medium text-black/78 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/82 dark:focus-visible:ring-white/12"
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={16}
                    color="#FF6363"
                    strokeWidth={1.8}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ProjectDialogFrame({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/24 px-4 backdrop-blur-[10px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-[1.75rem] border border-black/8 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.16)] dark:border-white/10 dark:bg-[#131313] dark:shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="space-y-1.5">
          <h3 className="text-[1.15rem] font-medium tracking-[-0.03em] text-black dark:text-white">
            {title}
          </h3>
          <p className="text-sm leading-6 text-black/58 dark:text-white/58">{description}</p>
        </div>

        <div className="mt-5">{children}</div>

        <div className="mt-5 flex justify-end">{footer}</div>
      </div>
    </div>
  );
}

function UpdateCoverDialog({
  project,
  onClose,
}: {
  project: ProjectDto;
  onClose: () => void;
}) {
  const [linkValue, setLinkValue] = useState(project.projectImg ?? "");
  const [previewSource, setPreviewSource] = useState<"link" | "file" | null>(
    project.projectImg ? "link" : null,
  );
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateProjectImageMutation = useUpdateProjectImageMutation();

  const previewUrl =
    previewSource === "file"
      ? filePreviewUrl
      : previewSource === "link" && linkValue.trim()
        ? linkValue.trim()
        : null;

  const showPlaceholder = !previewUrl || imageFailed;

  return (
    <ProjectDialogFrame
      title="Update cover"
      description={`Choose a new cover for ${formatProjectName(project.name)}.`}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={async () => {
            const nextProjectImg = previewUrl?.trim() ?? "";

            if (!nextProjectImg || imageFailed) {
              toast.error("Choose a valid cover image before confirming.");
              return;
            }

            try {
              await updateProjectImageMutation.mutateAsync({
                projectId: project.id,
                projectImg: nextProjectImg,
              });
              toast.success("Cover updated.");
              onClose();
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Could not update the project cover.",
              );
            }
          }}
          disabled={updateProjectImageMutation.isPending}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-5 text-sm font-medium text-white transition-colors hover:bg-[#f25555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6363]/40 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {updateProjectImageMutation.isPending ? "Saving..." : "Confirm"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor={`cover-link-${project.id}`}
            className="block text-[0.82rem] font-medium uppercase tracking-[0.18em] text-black/42 dark:text-white/42"
          >
            Image link
          </label>
          <input
            id={`cover-link-${project.id}`}
            type="url"
            value={linkValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            setLinkValue(nextValue);
            setImageFailed(false);
            if (nextValue.trim()) {
                setPreviewSource("link");
              } else {
                setPreviewSource(filePreviewUrl ? "file" : null);
              }
            }}
            placeholder="https://example.com/cover.jpg"
            className="h-12 w-full rounded-2xl border border-black/8 bg-accent px-4 text-sm text-black outline-none transition-colors placeholder:text-black/35 focus:border-black/12 dark:border-white/10 dark:text-white dark:placeholder:text-white/30"
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }

            try {
              const nextDataUrl = await readFileAsDataUrl(file);
              setFilePreviewUrl(nextDataUrl);
              setPreviewSource("file");
              setImageFailed(false);
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Could not load the selected image.",
              );
            }

            event.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex aspect-[1.28/1] w-full items-center justify-center overflow-hidden rounded-[1.7rem] border border-dashed border-black/10 bg-accent transition-colors hover:border-black/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:border-white/10 dark:hover:border-white/14 dark:focus-visible:ring-white/12"
        >
          {!showPlaceholder ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview can come from arbitrary user URL or a local object URL.
            <img
              src={previewUrl}
              alt={`Cover preview for ${project.name}`}
              className="h-full w-full object-cover"
              onLoad={() => setImageFailed(false)}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-5 text-center">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-[#FF6363] dark:bg-white/[0.05]">
                <HugeiconsIcon
                  icon={ImageAdd02Icon}
                  size={22}
                  color="currentColor"
                  strokeWidth={1.8}
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-black/80 dark:text-white/82">
                  Click to upload from device
                </p>
                <p className="text-xs leading-5 text-black/48 dark:text-white/48">
                  Or paste an image link above to preview it here.
                </p>
              </div>
            </div>
          )}
        </button>
      </div>
    </ProjectDialogFrame>
  );
}

function RenameProjectDialog({
  project,
  onClose,
}: {
  project: ProjectDto;
  onClose: () => void;
}) {
  const [projectName, setProjectName] = useState(project.name);
  const renameProjectMutation = useRenameProjectMutation(project.id);

  return (
    <ProjectDialogFrame
      title="Rename project"
      description="Update the project name."
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={async () => {
            const nextName = projectName.trim();

            if (!nextName) {
              toast.error("Project name cannot be empty.");
              return;
            }

            try {
              await renameProjectMutation.mutateAsync({ name: nextName });
              toast.success("Project renamed.");
              onClose();
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Could not rename the project.",
              );
            }
          }}
          disabled={renameProjectMutation.isPending}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-5 text-sm font-medium text-white transition-colors hover:bg-[#f25555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6363]/40 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {renameProjectMutation.isPending ? "Saving..." : "Confirm"}
        </button>
      }
    >
      <input
        type="text"
        value={projectName}
        onChange={(event) => setProjectName(event.target.value)}
        className="h-12 w-full rounded-2xl border border-black/8 bg-accent px-4 text-sm text-black outline-none transition-colors placeholder:text-black/35 focus:border-black/12 dark:border-white/10 dark:text-white dark:placeholder:text-white/30"
      />
    </ProjectDialogFrame>
  );
}

function DeleteProjectDialog({
  project,
  onClose,
}: {
  project: ProjectDto;
  onClose: () => void;
}) {
  const deleteProjectMutation = useDeleteProjectMutation(project.id);

  return (
    <ProjectDialogFrame
      title="Delete project"
      description="This Action cannot be reversed."
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={async () => {
            try {
              await deleteProjectMutation.mutateAsync();
              toast.success("Project deleted.");
              onClose();
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Could not delete the project.",
              );
            }
          }}
          disabled={deleteProjectMutation.isPending}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-5 text-sm font-medium text-white transition-colors hover:bg-[#f25555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6363]/40 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {deleteProjectMutation.isPending ? "Deleting..." : "Confirm"}
        </button>
      }
    >
      {null}
    </ProjectDialogFrame>
  );
}

function ProjectDialog({
  dialog,
  onClose,
}: {
  dialog: Exclude<ActiveProjectDialog, null>;
  onClose: () => void;
}) {
  if (dialog.action === "cover") {
    return <UpdateCoverDialog key={`${dialog.project.id}-cover`} project={dialog.project} onClose={onClose} />;
  }

  if (dialog.action === "rename") {
    return <RenameProjectDialog key={`${dialog.project.id}-rename`} project={dialog.project} onClose={onClose} />;
  }

  return <DeleteProjectDialog key={`${dialog.project.id}-delete`} project={dialog.project} onClose={onClose} />;
}

function ProjectTile({
  project,
  onSelectAction,
}: {
  project: ProjectDto;
  onSelectAction: (project: ProjectDto, action: ProjectAction) => void;
}) {
  const projectName = formatProjectName(project.name);
  const toggleProjectArchiveMutation = useToggleProjectArchiveMutation(project.id);

  return (
    <article className="flex w-full flex-col gap-3">
      <Link
        href={`/${project.id}`}
        className="group block focus-visible:outline-none"
      >
        <div className="overflow-hidden rounded-[1.25rem] border border-black/8 bg-black/[0.03] transition-transform duration-200 group-hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[0.035]">
          <div className="aspect-[1/1] w-full bg-black/[0.035] dark:bg-white/[0.03]">
            {project.projectImg ? (
              // eslint-disable-next-line @next/next/no-img-element -- project image metadata may contain arbitrary user-provided URLs.
              <img
                src={project.projectImg}
                alt={project.name}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
        </div>
      </Link>

      <div className="space-y-1 pl-2">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/${project.id}`}
            className="min-w-0 flex-1 focus-visible:outline-none"
          >
            <h2 className="truncate text-[1.02rem] font-medium tracking-[-0.02em] text-black dark:text-white">
              {projectName}
            </h2>
          </Link>
          <ProjectActionsMenu
            project={project}
            projectName={projectName}
            onSelectAction={async (action) => {
              if (action === "archive") {
                try {
                  const updatedProject = await toggleProjectArchiveMutation.mutateAsync();
                  toast.success(
                    updatedProject.archived ? "Project archived." : "Project unarchived.",
                  );
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not update the archive state.",
                  );
                }
                return;
              }

              onSelectAction(project, action);
            }}
          />
        </div>
        {project.description ? (
          <p className="max-w-[22ch] text-[0.82rem] leading-5 text-black/55 dark:text-white/58">
            {project.description}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function CreateProjectTile({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <article className="flex w-full flex-col gap-3">
      <button
        type="button"
        onClick={onCreateProject}
        aria-label="Create a new project"
        className="group flex aspect-[1/1] w-full items-center justify-center rounded-[1.25rem] border border-dashed border-black/12 bg-black/[0.012] text-black/32 transition-colors hover:border-black/18 hover:bg-black/[0.02] hover:text-black/42 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:border-white/12 dark:bg-white/[0.012] dark:text-white/28 dark:hover:border-white/18 dark:hover:bg-white/[0.02] dark:hover:text-white/40 dark:focus-visible:ring-white/12"
      >
        <HugeiconsIcon
          icon={PlusSignIcon}
          size={30}
          color="#FF6363"
          strokeWidth={1.7}
        />
      </button>
    </article>
  );
}

function LoadingTile() {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="aspect-[1/1] animate-pulse rounded-[1.6rem] bg-black/[0.05] dark:bg-white/[0.07]" />
      <div className="space-y-2 pl-2">
        <div className="h-5 w-32 animate-pulse rounded-full bg-black/[0.05] dark:bg-white/[0.07]" />
        <div className="h-4 w-44 animate-pulse rounded-full bg-black/[0.04] dark:bg-white/[0.05]" />
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-56 flex-col items-end justify-center gap-4 rounded-[2rem] border border-black/8 bg-black/[0.02] px-6 py-10 text-right dark:border-white/10 dark:bg-white/[0.03]">
      <p className="max-w-md text-sm leading-6 text-black/62 dark:text-white/62">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-black transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 dark:border-white/12 dark:text-white dark:hover:bg-white/[0.05] dark:focus-visible:ring-white/15"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({ filter }: { filter: ProjectVisibilityFilter }) {
  return (
    <div className="flex min-h-56 items-center justify-center px-6 py-10 text-center">
      <p className="max-w-md text-sm leading-6 text-black/62 dark:text-white/62">
        {filter === "archived"
          ? "No archived projects yet."
          : "No projects yet. Once projects are created, they&apos;ll show up here as image-first tiles."}
      </p>
    </div>
  );
}

export function ProjectsShowcase({
  filter = "active",
  onCreateProject,
}: {
  filter?: ProjectVisibilityFilter;
  onCreateProject: () => void;
}) {
  const { data: projects, isPending, isError, error, refetch } = useProjectsQuery();
  const [activeDialog, setActiveDialog] = useState<ActiveProjectDialog>(null);
  const gridClassName =
    "grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  const visibleProjects = (projects ?? []).filter((project) =>
    filter === "archived" ? project.archived : !project.archived,
  );

  if (isPending) {
    return (
      <div className={gridClassName}>
        {Array.from({ length: 6 }, (_, index) => (
          <LoadingTile key={index} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Failed to load projects."}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (filter === "archived" && !visibleProjects.length) {
    return <EmptyState filter={filter} />;
  }

  return (
    <>
      <div className={gridClassName}>
        {visibleProjects.map((project) => (
          <ProjectTile
            key={project.id}
            project={project}
            onSelectAction={(selectedProject, action) => {
              setActiveDialog({ project: selectedProject, action });
            }}
          />
        ))}
        {filter === "active" ? <CreateProjectTile onCreateProject={onCreateProject} /> : null}
      </div>

      {activeDialog ? <ProjectDialog dialog={activeDialog} onClose={() => setActiveDialog(null)} /> : null}
    </>
  );
}
