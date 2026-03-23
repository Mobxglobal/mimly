-- Allow lightweight deferred follow-up execution requests in workspace flow.

alter table public.pending_actions
  drop constraint if exists pending_actions_action_type_check;

alter table public.pending_actions
  add constraint pending_actions_action_type_check
  check (action_type in ('auth_required', 'payment_required', 'followup_request'));
