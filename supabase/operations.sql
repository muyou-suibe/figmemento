-- PhotoGift operational logging migration.
-- Run after supabase/schema.sql in the Supabase SQL Editor.

create table if not exists public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  action text not null check (action in ('fulfillment_status', 'tracking', 'photo_review', 'digital_delivery')),
  from_value text,
  to_value text,
  reason text,
  actor text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists order_status_logs_order_idx
  on public.order_status_logs (order_id, created_at desc);

alter table public.order_status_logs enable row level security;

grant select, insert, update, delete on public.order_status_logs to service_role;
