'use client';

import { useState } from 'react';
import type { MemberData, PermissionItem } from '@/services/member.service';
import { MemberDrawer } from './MemberDrawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function MembersTable({
  members,
  availablePermissions,
  canManage,
  workspaceId,
  currentMemberId,
}: {
  members: MemberData[];
  availablePermissions: PermissionItem[];
  canManage: boolean;
  workspaceId: string;
  currentMemberId: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);

  const filteredMembers = members.filter(m => 
    m.user.email.toLowerCase().includes(search.toLowerCase()) || 
    (m.user.full_name?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search members..." 
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.map((member) => (
              <TableRow 
                key={member.id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedMember(member)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border">
                      {member.user.avatar_url && <AvatarImage src={member.user.avatar_url} />}
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {member.user.full_name?.charAt(0) || member.user.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm leading-none">
                        {member.user.full_name || 'Unnamed User'}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">
                        {member.user.email}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {member.permissions.length === 0 ? (
                      <span className="text-xs text-muted-foreground">None</span>
                    ) : (
                      <>
                        <Badge variant="secondary" className="font-normal">
                          {member.permissions.length} Assigned
                        </Badge>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(member.joined_at), 'MMM d, yyyy')}
                </TableCell>
              </TableRow>
            ))}
            {filteredMembers.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  No members found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {filteredMembers.map((member) => (
          <Card 
            key={member.id} 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedMember(member)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border">
                  {member.user.avatar_url && <AvatarImage src={member.user.avatar_url} />}
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {member.user.full_name?.charAt(0) || member.user.email.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{member.user.full_name || 'Unnamed User'}</span>
                  <span className="text-xs text-muted-foreground">{member.user.email}</span>
                </div>
              </div>
              <Badge variant="secondary" className="font-normal text-xs">
                 {member.permissions.length} perms
              </Badge>
            </CardContent>
          </Card>
        ))}
        {filteredMembers.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg bg-card">
            No members found.
          </div>
        )}
      </div>

      <MemberDrawer 
        member={selectedMember}
        isOpen={selectedMember !== null}
        onClose={() => setSelectedMember(null)}
        availablePermissions={availablePermissions}
        canManage={canManage}
        workspaceId={workspaceId}
        currentMemberId={currentMemberId}
      />
    </div>
  );
}
