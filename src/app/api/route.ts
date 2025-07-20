import {
  HttpApp,
  HttpServerRequest,
  HttpServerResponse,
  UrlParams,
} from "@effect/platform";
import {
  Chunk,
  Effect,
  Layer,
  ManagedRuntime,
  Queue,
  Stream,
  Console,
} from "effect";

const flush = (chunk: Chunk.Chunk<any>) =>
  Effect.gen(function* () {
    yield* Effect.log("Draining " + chunk.length + " items");
  });

// Define the Batching service
class Batching extends Effect.Service<Batching>()("app/Batching", {
  effect: Effect.gen(function* () {
    const queue = yield* Queue.unbounded<any>();

    // Start the flusher in the background
    const flusher = Stream.fromQueue(queue)
      .pipe(
        Stream.groupedWithin(1000, "5 seconds"),
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
    return yield* HttpServerResponse.json({ message: "Hello, world!" });
  }
  yield* batching.add({ get: true });

  return yield* HttpServerResponse.json({});
});

const webHandler = HttpApp.toWebHandlerRuntime(runtime)(exampleEffectHandler);

type Handler = (req: Request) => Promise<Response>;
export const GET: Handler = webHandler;
export const POST: Handler = webHandler;
