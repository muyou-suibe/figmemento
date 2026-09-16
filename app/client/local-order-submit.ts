/** One establishment resubmit only. The serialized body/key are unchanged;
 * HttpOnly credentials are managed by the browser, never inspected by JS. */
export async function submitLocalOrderWithEstablishment(
  serializedBody: string,
  send: (init: RequestInit) => Promise<Response> = init => fetch("/api/local-orders", init),
): Promise<Response> {
  const submit = () => send({
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: serializedBody,
  });
  const first = await submit();
  return first.status === 204 ? submit() : first;
}
