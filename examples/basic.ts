import { RanobeLibClient } from "@iooe/ranobelib-sdk";

const client = new RanobeLibClient();
const url = "https://ranobelib.me/ru/book/91443--new-hero-in-dxd";

const full = await client.getFullTitleInfo(url);
console.log(full.title.names, full.title.rating, full.chapterCount);

const descriptor = full.volumes[0]?.chapters[0];
if (descriptor) {
  const chapter = await client.getChapter(url, descriptor.volume, descriptor.number, {
    branch: "first",
  });
  console.log(chapter.teams, chapter.dates, chapter.content.html.slice(0, 200));
}
