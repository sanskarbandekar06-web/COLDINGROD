'use client';

import type { PermissionItem } from '@/services/member.service';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface PermissionMatrixProps {
  availablePermissions: PermissionItem[];
  selectedPermissions: string[];
  onChange?: (selected: string[]) => void;
  disabled?: boolean;
}

export function PermissionMatrix({
  availablePermissions,
  selectedPermissions,
  onChange,
  disabled = false
}: PermissionMatrixProps) {
  
  const handleToggle = (key: string, checked: boolean) => {
    if (!onChange) return;
    if (checked) {
      onChange([...selectedPermissions, key]);
    } else {
      onChange(selectedPermissions.filter(p => p !== key));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {availablePermissions.map((perm) => (
          <div key={perm.id} className="flex flex-row items-start space-x-3 p-3 border rounded-lg bg-card transition-colors hover:bg-accent/50">
            <Checkbox 
              id={perm.key} 
              checked={selectedPermissions.includes(perm.key)}
              onCheckedChange={(checked) => handleToggle(perm.key, checked === true)}
              disabled={disabled}
              className="mt-1"
            />
            <div className="space-y-1 leading-none">
              <Label 
                htmlFor={perm.key} 
                className="font-medium cursor-pointer"
              >
                {perm.key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </Label>
              <p className="text-xs text-muted-foreground">{perm.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
