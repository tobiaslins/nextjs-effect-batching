import {
  HttpApp,
  HttpServerRequest,
  HttpServerResponse,
  UrlParams,
} from "@effect/platform";
import { waitUntil } from "@vercel/functions";
import {
  Chunk,
  Effect,
  Layer,
  ManagedRuntime,
  Queue,
  Stream,
  Console,
} from "effect";

const globalUnique = Math.random();

const flush = (chunk: Chunk.Chunk<any>) =>
  Effect.gen(function* () {
    yield* Effect.log("Draining " + chunk.length + " items", globalUnique);
    yield* Effect.tryPromise({
      try: (signal) =>
        fetch(`https://webhook.site/1188a779-b121-4818-adb9-4bb8c70a5058`, {
          method: "POST",
          body: JSON.stringify(Chunk.toArray(chunk)),
          signal,
        }),
      catch: () => Effect.void,
    });
  });

console.log(`Global init `, globalUnique);

// Define the Batching service
class Batching extends Effect.Service<Batching>()("app/Batching", {
  effect: Effect.gen(function* () {
    console.log("Initializing batcher", globalUnique);
    const queue = yield* Queue.unbounded<any>();

    // Start the flusher in the background
    const flusher = Stream.fromQueue(queue)
      .pipe(
        Stream.groupedWithin(1000, "3 seconds"),
        Stream.tap(flush),
        Stream.runDrain
      )
      .pipe(Effect.forkDaemon);

    yield* flusher;

    return {
      add: (item: any) => queue.offer(item),
    } as const;
  }),
  dependencies: [],
}) {}

const managedRuntime = ManagedRuntime.make(Batching.Default);
const runtime = await managedRuntime.runtime();

// Handler effect
const exampleEffectHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const batching = yield* Batching;

  if (request.method === "POST") {
    const body = yield* request.json;

    yield* batching.add(body);
    waitUntil(new Promise((res) => setTimeout(res, 2000)));

    return yield* HttpServerResponse.json({ message: "Hello, world!" });
  }
  yield* batching.add({ get: true });

  return yield* HttpServerResponse.json({});
});

const webHandler = HttpApp.toWebHandlerRuntime(runtime)(exampleEffectHandler);

type Handler = (req: Request) => Promise<Response>;
export const GET: Handler = webHandler;
export const POST: Handler = webHandler;
