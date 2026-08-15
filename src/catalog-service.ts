import { InvalidInputError } from "./errors.js";
import { parseCatalogPage } from "./parsers.js";
import { TitleService } from "./title-service.js";
import type { CatalogPage, CatalogQuery } from "./types.js";

export class CatalogService {
  readonly #titles: TitleService;

  public constructor(titles: TitleService) {
    this.#titles = titles;
  }

  public async listCatalog(query: CatalogQuery = {}): Promise<CatalogPage> {
    const perPage = query.perPage ?? 60;
    if (perPage < 10 || perPage > 60) {
      throw new InvalidInputError("Catalog perPage must be between 10 and 60.", { perPage });
    }
    const parameters: Array<[string, string | number | null | undefined]> = [
      ["site_id[]", this.#titles.siteId],
      ["page", query.page ?? 1],
      ["limit", perPage],
      ["sort_by", query.sort ?? "views"],
      ["q", query.query],
    ];
    for (const genre of query.genres ?? []) parameters.push(["genres[]", genre]);
    for (const tag of query.tags ?? []) parameters.push(["tags[]", tag]);
    if (query.status !== undefined) parameters.push(["status[]", query.status]);
    for (const origin of query.origins ?? []) parameters.push(["types[]", origin]);
    const raw = await this.#titles.transport.get("/manga", parameters, query.signal);
    return parseCatalogPage(raw, this.#titles.sourceBaseUrl);
  }

  public async *iterateCatalog(
    query: Omit<CatalogQuery, "page"> = {},
  ): AsyncGenerator<CatalogPage> {
    let pageNumber = 1;
    while (true) {
      const page = await this.listCatalog({ ...query, page: pageNumber });
      yield page;
      if (!page.hasNextPage) return;
      pageNumber += 1;
    }
  }
}
