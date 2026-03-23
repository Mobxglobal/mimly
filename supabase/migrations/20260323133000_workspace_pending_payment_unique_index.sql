-- Hardening: at most one unresolved payment_required action per workspace.

create unique index if not exists pending_actions_one_unresolved_payment_per_workspace_idx
  on public.pending_actions(workspace_id)
  where action_type = 'payment_required' and resolved_at is null;
