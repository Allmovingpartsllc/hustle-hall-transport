-- Allow a signed-in customer to cancel only their own Requested or Accepted order.
-- An admin's existing update policy remains responsible for rejecting orders.
drop policy if exists "Users can cancel own orders" on public.orders;

create policy "Users can cancel own orders"
on public.orders
for update
to authenticated
using (auth.uid() = user_id and status in ('Requested', 'Accepted'))
with check (auth.uid() = user_id and status = 'Cancelled');
