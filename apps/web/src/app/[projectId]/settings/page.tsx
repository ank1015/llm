import { redirect } from "next/navigation";

export default async function ProjectSettingsRedirectPage({
  params,
}: PageProps<"/[projectId]/settings">) {
  const { projectId } = await params;

  redirect(`/${projectId}/settings/general`);
}
