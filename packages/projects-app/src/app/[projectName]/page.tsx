type Params = { projectName: string };

export default async function ProjectPage({
  params,
}: {
  params: Promise<Params>;
}): Promise<React.ReactElement> {
  const { projectName } = await params;

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-foreground">{decodeURIComponent(projectName)}</h1>
    </div>
  );
}
