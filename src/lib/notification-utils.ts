import type {
  NotificationActorType,
  NotificationEntityType,
} from '@/types/notification';

export const NOTIFICATION_ACTOR_LABELS: Record<
  NotificationActorType,
  string
> = {
  all: 'All actors',
  human: 'People',
  ai_agent: 'AI agents',
  system: 'System',
};

export const NOTIFICATION_ENTITY_LABELS: Record<
  NotificationEntityType,
  string
> = {
  all: 'All activity',
  lead: 'Leads',
  client: 'Clients',
  project: 'Projects',
  task: 'Tasks',
  meeting: 'Meetings',
  outreach_message: 'Outreach',
  asset: 'Assets',
  member: 'Members',
  ai: 'AI Center',
};

const ENTITY_LABELS: Record<string, string> = {
  ai_action: 'AI action',
  ai_actions: 'AI action',
  ai_agent: 'AI agent',
  ai_agents: 'AI agent',
  ai_approval: 'AI approval',
  ai_approvals: 'AI approval',
  asset: 'asset',
  assets: 'asset',
  client: 'client',
  clients: 'client',
  lead: 'lead',
  leads: 'lead',
  lead_discovery_run: 'lead discovery',
  meeting: 'meeting',
  meetings: 'meeting',
  member: 'member',
  members: 'member',
  outreach_message: 'outreach message',
  outreach_messages: 'outreach message',
  project: 'project',
  projects: 'project',
  task: 'task',
  tasks: 'task',
  workspace: 'workspace',
  workspace_member: 'member',
  workspace_members: 'member',
};

function withIndefiniteArticle(entity: string) {
  const article = /^[aeiou]/i.test(entity) ? 'an' : 'a';
  return `${article} ${entity}`;
}

function safeMetadataText(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length <= 80 ? value : null;
}

export function notificationMessage(
  action: string,
  entityType: string,
  metadata: Record<string, unknown> | null,
) {
  const entity = ENTITY_LABELS[entityType] ?? entityType.replaceAll('_', ' ');
  const status = safeMetadataText(metadata, 'status');

  if (action === 'created' || action.endsWith('_created')) {
    return `created ${withIndefiniteArticle(entity)}`;
  }
  if (action === 'updated' || action.endsWith('_updated')) {
    return `updated ${withIndefiniteArticle(entity)}`;
  }
  if (action === 'deleted' || action.endsWith('_deleted')) {
    return `removed ${withIndefiniteArticle(entity)}`;
  }
  if (action === 'archived' || action.endsWith('_archived')) {
    return `archived ${withIndefiniteArticle(entity)}`;
  }
  if (action === 'restored' || action.endsWith('_restored')) {
    return `restored ${withIndefiniteArticle(entity)}`;
  }
  if (action === 'status_changed') {
    return status
      ? `changed ${withIndefiniteArticle(entity)} status to ${status.replaceAll('_', ' ')}`
      : `changed ${withIndefiniteArticle(entity)} status`;
  }
  if (action === 'note' || action.endsWith('_note_added')) {
    return `added a note to ${withIndefiniteArticle(entity)}`;
  }

  const readableAction = action.replaceAll('_', ' ').trim();
  return readableAction.includes(entity)
    ? readableAction
    : `${readableAction} · ${entity}`;
}

export function notificationHref(
  workspaceSlug: string,
  entityType: string,
  entityId: string,
) {
  const base = `/dashboard/${workspaceSlug}`;
  const routes: Record<string, string> = {
    ai_action: `${base}/ai/actions/${entityId}`,
    ai_actions: `${base}/ai/actions/${entityId}`,
    ai_agent: `${base}/ai/agents/${entityId}`,
    ai_agents: `${base}/ai/agents/${entityId}`,
    ai_approval: `${base}/ai/approvals/${entityId}`,
    ai_approvals: `${base}/ai/approvals/${entityId}`,
    asset: `${base}/assets`,
    assets: `${base}/assets`,
    client: `${base}/clients/${entityId}`,
    clients: `${base}/clients/${entityId}`,
    lead: `${base}/leads/${entityId}`,
    leads: `${base}/leads/${entityId}`,
    lead_discovery_run: `${base}/leads/discovery/${entityId}`,
    meeting: `${base}/meetings/${entityId}`,
    meetings: `${base}/meetings/${entityId}`,
    member: `${base}/members`,
    members: `${base}/members`,
    outreach_message: `${base}/outreach/messages/${entityId}`,
    outreach_messages: `${base}/outreach/messages/${entityId}`,
    project: `${base}/projects/${entityId}`,
    projects: `${base}/projects/${entityId}`,
    task: `${base}/tasks`,
    tasks: `${base}/tasks`,
    workspace: `${base}/settings`,
    workspace_member: `${base}/members`,
    workspace_members: `${base}/members`,
  };

  return routes[entityType] ?? `${base}/activity`;
}

export function notificationEntityValues(filter: NotificationEntityType) {
  const values: Record<NotificationEntityType, string[]> = {
    all: [],
    lead: ['lead', 'leads', 'lead_discovery_run'],
    client: ['client', 'clients'],
    project: ['project', 'projects'],
    task: ['task', 'tasks'],
    meeting: ['meeting', 'meetings'],
    outreach_message: ['outreach_message', 'outreach_messages'],
    asset: ['asset', 'assets'],
    member: ['member', 'members', 'workspace_member', 'workspace_members'],
    ai: [
      'ai_action',
      'ai_actions',
      'ai_agent',
      'ai_agents',
      'ai_approval',
      'ai_approvals',
    ],
  };

  return values[filter];
}
