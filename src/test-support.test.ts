export interface FakeCall {
  url: string;
  method: string;
  init: RequestInit;
}

/** A fetch stand-in driven by a per-call handler; records every request. */
export function scriptedFetch(
  handler: (req: FakeCall, index: number) => Response | Promise<Response>,
) {
  const calls: FakeCall[] = [];
  const impl = ((url: string | URL, init: RequestInit = {}) => {
    const req: FakeCall = {
      url: String(url),
      method: init.method ?? "GET",
      init,
    };
    calls.push(req);
    return Promise.resolve(handler(req, calls.length - 1));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

export const json = (
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
