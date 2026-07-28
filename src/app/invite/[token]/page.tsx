import { acceptInvite } from '@/actions/member';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { UserPlus } from 'lucide-react';

export default async function InvitePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;

  return (
    <div className="flex h-screen w-full items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Workspace Invitation</CardTitle>
          <CardDescription>
            You have been invited to join a Coldingrod workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-center text-muted-foreground">
            Click the button below to accept the invitation and access the workspace.
          </p>
        </CardContent>
        <CardFooter>
          <form 
            action={async () => {
              'use server';
              await acceptInvite(params.token);
            }} 
            className="w-full"
          >
            <Button className="w-full" type="submit">
              Accept Invitation
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
