const globalUnique = Math.random();

let buffer: any[] = [];
let timer: NodeJS.Timeout | null = null;
let leaderResolve: (() => void) | null = null;

console.log(`Global init simple`, globalUnique);

const flush = async () => {
  if (buffer.length === 0) return;

  console.log("Draining " + buffer.length + " items", globalUnique);

  try {
    await fetch(`https://webhook.site/1188a779-b121-4818-adb9-4bb8c70a5058`, {
      method: "POST",
      body: JSON.stringify(buffer),
    });
  } catch (error) {
    console.error("Flush error:", error);
  }

  buffer = [];
  timer = null;

  if (leaderResolve) {
    leaderResolve();
    leaderResolve = null;
  }
};

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  buffer.push(body);

  if (!timer) {
    const p = new Promise<void>((r) => (leaderResolve = r));
    timer = setTimeout(flush, 5000);
    await p;
    return Response.json({ ok: true });
  }

  return new Response(null, { status: 201 });
}
