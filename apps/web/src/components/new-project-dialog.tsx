"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ImageAdd02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { useCreateProjectMutation } from "@/hooks/api";

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

export function NewProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: { id: string; name: string }) => void;
}) {
  const [projectName, setProjectName] = useState("");
  const [coverLink, setCoverLink] = useState("");
  const [previewSource, setPreviewSource] = useState<"link" | "file" | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createProjectMutation = useCreateProjectMutation();

  const handleClose = useCallback(() => {
    setProjectName("");
    setCoverLink("");
    setPreviewSource(null);
    setFilePreviewUrl(null);
    setImageFailed(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, open]);

  if (!open) {
    return null;
  }

  const previewUrl =
    previewSource === "file"
      ? filePreviewUrl
      : previewSource === "link" && coverLink.trim()
        ? coverLink.trim()
        : null;

  const showPlaceholder = !previewUrl || imageFailed;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/24 px-4 backdrop-blur-[10px]"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create project"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-[1.75rem] border border-black/8 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.16)] dark:border-white/10 dark:bg-[#131313] dark:shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="space-y-1.5">
          <h3 className="text-[1.15rem] font-medium tracking-[-0.03em] text-black dark:text-white">
            New project
          </h3>
          <p className="text-sm leading-6 text-black/58 dark:text-white/58">
            Add a project name and an optional cover image.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="new-project-name"
              className="block text-[0.82rem] font-medium uppercase tracking-[0.18em] text-black/42 dark:text-white/42"
            >
              Project name
            </label>
            <input
              id="new-project-name"
              type="text"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project name"
              className="h-12 w-full rounded-2xl border border-black/8 bg-accent px-4 text-sm text-black outline-none transition-colors placeholder:text-black/35 focus:border-black/12 dark:border-white/10 dark:text-white dark:placeholder:text-white/30"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="new-project-cover-link"
              className="block text-[0.82rem] font-medium uppercase tracking-[0.18em] text-black/42 dark:text-white/42"
            >
              Cover link
            </label>
            <input
              id="new-project-cover-link"
              type="url"
              value={coverLink}
              onChange={(event) => {
                const nextValue = event.target.value;
                setCoverLink(nextValue);
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
              // eslint-disable-next-line @next/next/no-img-element -- preview can come from arbitrary user URL or a local data URL.
              <img
                src={previewUrl}
                alt="New project cover preview"
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

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={async () => {
              const trimmedName = projectName.trim();

              if (!trimmedName) {
                toast.error("Project name is required.");
                return;
              }

              const projectImg =
                previewSource === "file"
                  ? filePreviewUrl
                  : coverLink.trim()
                    ? coverLink.trim()
                    : undefined;

              try {
                const project = await createProjectMutation.mutateAsync({
                  name: trimmedName,
                  ...(projectImg ? { projectImg } : {}),
                });
                toast.success("Project created.");
                onCreated({
                  id: project.id,
                  name: project.name,
                });
                handleClose();
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Could not create the project.",
                );
              }
            }}
            disabled={createProjectMutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-5 text-sm font-medium text-white transition-colors hover:bg-[#f25555] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6363]/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {createProjectMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
