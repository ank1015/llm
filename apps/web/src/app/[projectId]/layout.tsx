import { ProjectLayoutShell } from "@/components/project-layout-shell";

export default function ProjectLayout({
  children,
}: LayoutProps<"/[projectId]">) {
  return <ProjectLayoutShell>{children}</ProjectLayoutShell>;
}
