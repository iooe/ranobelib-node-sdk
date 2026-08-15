import { FileCache, RanobeLibClient } from "@iooe/ranobelib-sdk";

const client = new RanobeLibClient({
  cache: new FileCache(".ranobelib-cache"),
  minRequestIntervalMs: 800,
  maxConcurrency: 4,
});

await client.syncTitle(
  "https://ranobelib.me/ru/book/91443--new-hero-in-dxd",
  "./books/new-hero-in-dxd",
  {
    branch: "latest",
    concurrency: 4,
    onProgress: ({ completed, total, skipped, failed, current }) => {
      console.log({ completed, total, skipped, failed, chapter: current?.number });
    },
  },
);
