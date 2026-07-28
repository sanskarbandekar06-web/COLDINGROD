import { CreateWorkspaceWizard } from '@/components/workspace/CreateWorkspaceWizard';

export default function CreateWorkspacePage() {
  return (
    <div className="flex h-screen w-full items-center justify-center p-4 bg-muted/30">
      <div className="w-full">
         <CreateWorkspaceWizard />
      </div>
    </div>
  );
}
