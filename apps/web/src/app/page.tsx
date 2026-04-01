"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectsBrowser } from "@/components/projects-browser";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <main className="bg-home-page text-foreground flex min-h-[100dvh] w-full min-w-0 flex-col overflow-hidden transition-colors">
        <header className="flex h-12 w-full min-w-0 shrink-0 items-center gap-3 px-3">
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-4 pb-10 pt-4 sm:px-6 lg:px-8">
          <ProjectsBrowser
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onCreateProject={() => setIsCreateDialogOpen(true)}
          />
        </section>
      </main>

      <NewProjectDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreated={(project) => {
          setActiveTab("active");
          router.push(`/${project.id}`);
        }}
      />
    </>
  );
}
