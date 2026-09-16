-- PhotoGift Customization Phase B: pre-order drafts and private media only.
--
-- This local artifact is additive. It intentionally contains no order_items
-- reference, no attachment columns, and no attached lifecycle state.

begin;

create table public.customization_drafts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  configuration_revision_id uuid not null,
  owner_binding_id uuid not null,
  state text not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customization_drafts_revision_product_fkey
    foreign key (configuration_revision_id, product_id)
    references public.product_customization_configs(id, product_id)
    on update no action
    on delete restrict,
  constraint customization_drafts_identity_revision_product_key
    unique (id, product_id, configuration_revision_id),
  constraint customization_drafts_state_check
    check (state in ('active', 'expired', 'abandoned'))
);

create index customization_drafts_owner_state_expiry_idx
  on public.customization_drafts (owner_binding_id, state, expires_at);

create index customization_drafts_product_revision_idx
  on public.customization_drafts (product_id, configuration_revision_id);

create table public.customization_draft_values (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  product_id uuid not null,
  configuration_revision_id uuid not null,
  field_definition_id uuid not null,
  stable_field_id uuid not null,
  text_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customization_draft_values_draft_context_fkey
    foreign key (draft_id, product_id, configuration_revision_id)
    references public.customization_drafts(id, product_id, configuration_revision_id)
    on update no action
    on delete restrict,
  constraint customization_draft_values_definition_context_fkey
    foreign key (
      field_definition_id,
      stable_field_id,
      product_id,
      configuration_revision_id
    )
    references public.customization_fields(
      id,
      stable_field_id,
      product_id,
      configuration_revision_id
    )
    on update no action
    on delete restrict,
  constraint customization_draft_values_draft_definition_key
    unique (draft_id, field_definition_id),
  constraint customization_draft_values_identity_draft_field_key
    unique (id, draft_id, stable_field_id)
);

create table public.customer_upload_receipts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  product_id uuid not null,
  configuration_revision_id uuid not null,
  field_definition_id uuid not null,
  stable_field_id uuid not null,
  provider_kind text not null,
  object_container text not null,
  object_key text not null,
  original_filename text,
  mime_type text not null,
  file_size_bytes integer not null,
  width integer not null,
  height integer not null,
  state text not null default 'active',
  replaced_by_receipt_id uuid,
  expires_at timestamptz not null,
  cleanup_claimed_at timestamptz,
  cleanup_lease_expires_at timestamptz,
  cleanup_attempts integer not null default 0,
  cleanup_last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleaned_at timestamptz,
  constraint customer_upload_receipts_draft_context_fkey
    foreign key (draft_id, product_id, configuration_revision_id)
    references public.customization_drafts(id, product_id, configuration_revision_id)
    on update no action
    on delete restrict,
  constraint customer_upload_receipts_definition_context_fkey
    foreign key (
      field_definition_id,
      stable_field_id,
      product_id,
      configuration_revision_id
    )
    references public.customization_fields(
      id,
      stable_field_id,
      product_id,
      configuration_revision_id
    )
    on update no action
    on delete restrict,
  constraint customer_upload_receipts_identity_draft_field_key
    unique (id, draft_id, stable_field_id),
  constraint customer_upload_receipts_provider_locator_key
    unique (provider_kind, object_container, object_key),
  constraint customer_upload_receipts_replacement_context_fkey
    foreign key (replaced_by_receipt_id, draft_id, stable_field_id)
    references public.customer_upload_receipts(id, draft_id, stable_field_id)
    on update no action
    on delete restrict,
  constraint customer_upload_receipts_provider_kind_check
    check (
      provider_kind ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
      and length(provider_kind) <= 80
    ),
  constraint customer_upload_receipts_object_container_check
    check (btrim(object_container) <> '' and length(object_container) <= 255),
  constraint customer_upload_receipts_object_key_check
    check (btrim(object_key) <> '' and length(object_key) <= 2048),
  constraint customer_upload_receipts_original_filename_check
    check (
      original_filename is null
      or (btrim(original_filename) <> '' and length(original_filename) <= 255)
    ),
  constraint customer_upload_receipts_mime_type_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint customer_upload_receipts_trusted_metadata_check
    check (file_size_bytes > 0 and width > 0 and height > 0),
  constraint customer_upload_receipts_state_check
    check (
      state in (
        'active',
        'replaced',
        'removed',
        'expired',
        'cleanup_pending',
        'cleanup_failed',
        'cleanup_completed'
      )
    ),
  constraint customer_upload_receipts_replacement_shape_check
    check (
      (state = 'replaced' and replaced_by_receipt_id is not null)
      or (
        state in ('active', 'removed', 'expired')
        and replaced_by_receipt_id is null
      )
      or state in ('cleanup_pending', 'cleanup_failed', 'cleanup_completed')
    ),
  constraint customer_upload_receipts_replacement_not_self_check
    check (
      replaced_by_receipt_id is null
      or replaced_by_receipt_id <> id
    ),
  constraint customer_upload_receipts_cleanup_lease_shape_check
    check (
      (
        state = 'cleanup_pending'
        and cleanup_claimed_at is not null
        and cleanup_lease_expires_at is not null
        and cleanup_lease_expires_at > cleanup_claimed_at
      )
      or (
        state <> 'cleanup_pending'
        and cleanup_claimed_at is null
        and cleanup_lease_expires_at is null
      )
    ),
  constraint customer_upload_receipts_cleanup_attempts_check
    check (cleanup_attempts >= 0),
  constraint customer_upload_receipts_cleanup_error_shape_check
    check (
      (
        state = 'cleanup_failed'
        and cleanup_last_error_code is not null
        and cleanup_last_error_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
        and length(cleanup_last_error_code) <= 120
      )
      or (
        state <> 'cleanup_failed'
        and cleanup_last_error_code is null
      )
    ),
  constraint customer_upload_receipts_cleaned_at_shape_check
    check (
      (state = 'cleanup_completed' and cleaned_at is not null)
      or (state <> 'cleanup_completed' and cleaned_at is null)
    )
);

create index customer_upload_receipts_draft_state_idx
  on public.customer_upload_receipts (draft_id, state);

create index customer_upload_receipts_cleanup_candidate_idx
  on public.customer_upload_receipts (state, expires_at)
  where state in ('replaced', 'removed', 'expired', 'cleanup_failed');

create index customer_upload_receipts_cleanup_lease_idx
  on public.customer_upload_receipts (state, cleanup_lease_expires_at)
  where state = 'cleanup_pending';

create table public.customization_value_images (
  id uuid primary key default gen_random_uuid(),
  draft_value_id uuid not null,
  draft_id uuid not null,
  stable_field_id uuid not null,
  receipt_id uuid not null,
  position integer not null default 0,
  crop_x double precision,
  crop_y double precision,
  crop_width double precision,
  crop_height double precision,
  created_at timestamptz not null default now(),
  constraint customization_value_images_draft_value_context_fkey
    foreign key (draft_value_id, draft_id, stable_field_id)
    references public.customization_draft_values(id, draft_id, stable_field_id)
    on update no action
    on delete restrict,
  constraint customization_value_images_receipt_context_fkey
    foreign key (receipt_id, draft_id, stable_field_id)
    references public.customer_upload_receipts(id, draft_id, stable_field_id)
    on update no action
    on delete restrict,
  constraint customization_value_images_draft_value_position_key
    unique (draft_value_id, position),
  constraint customization_value_images_receipt_key unique (receipt_id),
  constraint customization_value_images_position_check
    check (position >= 0),
  constraint customization_value_images_crop_check
    check (
      (
        crop_x is null
        and crop_y is null
        and crop_width is null
        and crop_height is null
      )
      or (
        crop_x is not null
        and crop_y is not null
        and crop_width is not null
        and crop_height is not null
        and crop_x <> 'NaN'::double precision
        and crop_x <> 'Infinity'::double precision
        and crop_x <> '-Infinity'::double precision
        and crop_y <> 'NaN'::double precision
        and crop_y <> 'Infinity'::double precision
        and crop_y <> '-Infinity'::double precision
        and crop_width <> 'NaN'::double precision
        and crop_width <> 'Infinity'::double precision
        and crop_width <> '-Infinity'::double precision
        and crop_height <> 'NaN'::double precision
        and crop_height <> 'Infinity'::double precision
        and crop_height <> '-Infinity'::double precision
        and crop_x >= 0
        and crop_y >= 0
        and crop_width > 0
        and crop_height > 0
        and crop_x <= 1
        and crop_y <= 1
        and crop_width <= 1
        and crop_height <= 1
        and crop_x + crop_width <= 1
        and crop_y + crop_height <= 1
      )
    )
);

create function public.enforce_customization_phase_b_graph_integrity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_replacement_target_state text;
begin
  if tg_op <> 'DELETE' then
    if tg_table_name = 'customization_drafts' then
      if tg_op = 'INSERT' and new.state <> 'active' then
        raise exception using
          errcode = '23514',
          message = 'Customization draft lifecycle integrity constraint violated.';
      end if;

      if tg_op = 'UPDATE'
        and new.state is distinct from old.state
        and not (
          (old.state = 'active' and new.state in ('expired', 'abandoned'))
          or (old.state = 'expired' and new.state = 'abandoned')
        )
      then
        raise exception using
          errcode = '23514',
          message = 'Customization draft lifecycle integrity constraint violated.';
      end if;
    end if;

    if tg_table_name = 'customer_upload_receipts' then
      if tg_op = 'INSERT' and new.state <> 'active' then
        raise exception using
          errcode = '23514',
          message = 'Customization receipt lifecycle integrity constraint violated.';
      end if;

      if tg_op = 'UPDATE'
        and new.state is distinct from old.state
        and not (
          (old.state = 'active' and new.state in ('replaced', 'removed', 'expired'))
          or (old.state in ('replaced', 'removed', 'expired', 'cleanup_failed') and new.state = 'cleanup_pending')
          or (old.state = 'cleanup_pending' and new.state in ('cleanup_completed', 'cleanup_failed'))
        )
      then
        raise exception using
          errcode = '23514',
          message = 'Customization receipt lifecycle integrity constraint violated.';
      end if;

      if tg_op = 'UPDATE'
        and old.replaced_by_receipt_id is distinct from new.replaced_by_receipt_id
        and not (
          old.state = 'active'
          and old.replaced_by_receipt_id is null
          and new.state = 'replaced'
          and new.replaced_by_receipt_id is not null
        )
      then
        raise exception using
          errcode = '23514',
          message = 'Customization replacement lineage is immutable.';
      end if;

      if tg_op = 'UPDATE'
        and old.state = 'active'
        and new.state = 'replaced'
      then
        select target.state
        into v_replacement_target_state
        from public.customer_upload_receipts as target
        where target.id = new.replaced_by_receipt_id
          and target.draft_id = new.draft_id
          and target.stable_field_id = new.stable_field_id;

        if v_replacement_target_state is distinct from 'active' then
          raise exception using
            errcode = '23514',
            message = 'Customization replacement lifecycle integrity constraint violated.';
        end if;
      end if;
    end if;
  end if;

  if exists (
    select 1
    from public.customer_upload_receipts as receipt
    join public.customization_drafts as draft
      on draft.id = receipt.draft_id
      and draft.product_id = receipt.product_id
      and draft.configuration_revision_id = receipt.configuration_revision_id
    where receipt.state = 'active'
      and draft.state <> 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Customization lifecycle integrity constraint violated.';
  end if;

  if exists (
    select 1
    from public.customer_upload_receipts as receipt
    join public.customization_fields as definition
      on definition.id = receipt.field_definition_id
      and definition.stable_field_id = receipt.stable_field_id
      and definition.product_id = receipt.product_id
      and definition.configuration_revision_id = receipt.configuration_revision_id
    where definition.kind <> 'image'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Customization receipt field integrity constraint violated.';
  end if;

  if exists (
    select 1
    from public.customization_value_images as placement
    join public.customer_upload_receipts as receipt
      on receipt.id = placement.receipt_id
      and receipt.draft_id = placement.draft_id
      and receipt.stable_field_id = placement.stable_field_id
    where receipt.state <> 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Customization placement lifecycle integrity constraint violated.';
  end if;

  if exists (
    with recursive replacement_lineage as (
      select
        receipt.id as origin_id,
        receipt.replaced_by_receipt_id as next_id,
        array[receipt.id]::uuid[] as visited_ids
      from public.customer_upload_receipts as receipt
      where receipt.replaced_by_receipt_id is not null

      union all

      select
        replacement_lineage.origin_id,
        next_receipt.replaced_by_receipt_id,
        pg_catalog.array_append(replacement_lineage.visited_ids, next_receipt.id)
      from replacement_lineage
      join public.customer_upload_receipts as next_receipt
        on next_receipt.id = replacement_lineage.next_id
      where replacement_lineage.next_id is not null
        and not next_receipt.id = any(replacement_lineage.visited_ids)
    )
    select 1
    from replacement_lineage
    join public.customer_upload_receipts as next_receipt
      on next_receipt.id = replacement_lineage.next_id
    where next_receipt.id = any(replacement_lineage.visited_ids)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Customization replacement lineage integrity constraint violated.';
  end if;

  return null;
end;
$function$;

revoke all privileges on function public.enforce_customization_phase_b_graph_integrity() from public;
revoke all privileges on function public.enforce_customization_phase_b_graph_integrity() from anon;
revoke all privileges on function public.enforce_customization_phase_b_graph_integrity() from authenticated;
revoke all privileges on function public.enforce_customization_phase_b_graph_integrity() from service_role;

create constraint trigger customization_phase_b_draft_graph_integrity_trigger
after insert or update or delete on public.customization_drafts
deferrable initially deferred
for each row
execute function public.enforce_customization_phase_b_graph_integrity();

create constraint trigger customization_phase_b_receipt_graph_integrity_trigger
after insert or update or delete on public.customer_upload_receipts
deferrable initially deferred
for each row
execute function public.enforce_customization_phase_b_graph_integrity();

create constraint trigger customization_phase_b_placement_graph_integrity_trigger
after insert or update or delete on public.customization_value_images
deferrable initially deferred
for each row
execute function public.enforce_customization_phase_b_graph_integrity();

create trigger customization_drafts_set_updated_at
before update on public.customization_drafts
for each row execute function public.set_updated_at();

create trigger customization_draft_values_set_updated_at
before update on public.customization_draft_values
for each row execute function public.set_updated_at();

create trigger customer_upload_receipts_set_updated_at
before update on public.customer_upload_receipts
for each row execute function public.set_updated_at();

alter table public.customization_drafts enable row level security;
alter table public.customization_draft_values enable row level security;
alter table public.customer_upload_receipts enable row level security;
alter table public.customization_value_images enable row level security;

create policy "customization server manages drafts"
  on public.customization_drafts
  for all to service_role
  using (true)
  with check (true);

create policy "customization server manages draft values"
  on public.customization_draft_values
  for all to service_role
  using (true)
  with check (true);

create policy "customization server manages upload receipts"
  on public.customer_upload_receipts
  for all to service_role
  using (true)
  with check (true);

create policy "customization server manages draft image placements"
  on public.customization_value_images
  for all to service_role
  using (true)
  with check (true);

revoke all privileges on table public.customization_drafts from public;
revoke all privileges on table public.customization_drafts from anon;
revoke all privileges on table public.customization_drafts from authenticated;
revoke all privileges on table public.customization_draft_values from public;
revoke all privileges on table public.customization_draft_values from anon;
revoke all privileges on table public.customization_draft_values from authenticated;
revoke all privileges on table public.customer_upload_receipts from public;
revoke all privileges on table public.customer_upload_receipts from anon;
revoke all privileges on table public.customer_upload_receipts from authenticated;
revoke all privileges on table public.customization_value_images from public;
revoke all privileges on table public.customization_value_images from anon;
revoke all privileges on table public.customization_value_images from authenticated;

grant usage on schema public to service_role;
grant select, insert, update on table public.customization_drafts to service_role;
grant select, insert, update, delete on table public.customization_draft_values to service_role;
grant select, insert, update on table public.customer_upload_receipts to service_role;
grant select, insert, update, delete on table public.customization_value_images to service_role;

commit;
