import { ProjectModelSettingsPanel } from "@/components/project-model-settings-panel";

export default function ProjectModelsSettingsPage() {
  return (
    <main className="bg-home-page text-foreground flex h-full min-h-0 w-full min-w-0 overflow-y-auto px-6 pt-10 pb-24">
      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <div className="border-home-border border-b pb-6">
          <h1 className="text-[34px] font-semibold tracking-[-0.03em] text-black dark:text-white">
            Models and Providers
          </h1>
        </div>

        <ProjectModelSettingsPanel />
      </div>
    </main>
  );
}
