import { normalizeChapterContent, normalizeRichText } from "./content.js";
import { InvalidApiPayloadError } from "./errors.js";
import type {
  CatalogPage,
  CatalogTitle,
  Chapter,
  ChapterDescriptor,
  NamedEntity,
  TaxonomyItem,
  Team,
  Title,
  TranslationBranch,
  UnknownRecord,
  Uploader,
  VolumeDescriptor,
} from "./types.js";
import {
  absoluteUrl,
  asArray,
  asBoolean,
  asInteger,
  asNonEmptyString,
  asNumber,
  asRecord,
  asString,
  nowIso,
  sha256,
  uniqueStrings,
} from "./utils.js";

export function parseTitle(raw: unknown, sourceBaseUrl: string): Title {
  const record = asRecord(raw);
  const id = asInteger(record.id);
  const slugUrl = asNonEmptyString(record.slug_url);
  if (id === null || !slugUrl) {
    throw new InvalidApiPayloadError("Title payload is missing id or slug_url.", { raw: record });
  }
  const original = asNonEmptyString(record.name) ?? slugUrl;
  const russian = asNonEmptyString(record.rus_name);
  const english = asNonEmptyString(record.eng_name);
  const cover = asRecord(record.cover);
  const background = asRecord(record.background);
  const age = asRecord(record.ageRestriction);
  const origin = asRecord(record.type);
  const status = asRecord(record.status);
  const translationStatus = asRecord(record.scanlateStatus);
  const rating = asRecord(record.rating);
  const counts = asRecord(record.items_count);

  return {
    id,
    slug: asNonEmptyString(record.slug) ?? slugUrl.replace(/^\d+--/, ""),
    slugUrl,
    sourceUrl: `${sourceBaseUrl.replace(/\/+$/, "")}/ru/book/${slugUrl}`,
    names: {
      original,
      russian,
      english,
      aliases: uniqueStrings([
        ...asArray(record.otherNames).map(asNonEmptyString),
        original,
        russian,
        english,
      ]),
    },
    summary: normalizeRichText(record.summary, sourceBaseUrl),
    cover: {
      filename: asString(cover.filename),
      thumbnail: absoluteUrl(asString(cover.thumbnail), sourceBaseUrl),
      default: absoluteUrl(asString(cover.default), sourceBaseUrl),
      medium: absoluteUrl(asString(cover.md), sourceBaseUrl),
    },
    backgroundUrl:
      absoluteUrl(asString(background.url), sourceBaseUrl) ??
      absoluteUrl(asString(record.background), sourceBaseUrl),
    ageRestriction: { id: asInteger(age.id), label: asString(age.label) },
    origin: { id: asInteger(origin.id), label: asString(origin.label) },
    status: { id: asInteger(status.id), label: asString(status.label) },
    translationStatus: {
      id: asInteger(translationStatus.id),
      label: asString(translationStatus.label),
    },
    releaseDate: asNonEmptyString(record.releaseDate),
    releaseDateLabel: asNonEmptyString(record.releaseDateString),
    licensed: asBoolean(record.is_licensed) ?? false,
    rating: {
      average: asNumber(rating.average),
      votes: asInteger(rating.votes) ?? 0,
    },
    chapterCount: {
      uploaded: asInteger(counts.uploaded) ?? 0,
      total: asInteger(counts.total) ?? 0,
    },
    authors: asArray(record.authors).map(parseNamedEntity),
    artists: asArray(record.artists).map(parseNamedEntity),
    teams: asArray(record.teams).map(parseTeam),
    genres: asArray(record.genres).map(parseTaxonomy),
    tags: asArray(record.tags).map(parseTaxonomy),
    fetchedAt: nowIso(),
    raw: record,
  };
}

export function parseChapterIndex(raw: unknown): ChapterDescriptor[] {
  if (!Array.isArray(raw)) {
    throw new InvalidApiPayloadError("Chapter index payload is not an array.");
  }
  return raw.map((item, arrayIndex) => {
    const record = asRecord(item);
    const id = asInteger(record.id);
    const volume = asNonEmptyString(record.volume) ?? "0";
    const number = asNonEmptyString(record.number);
    if (id === null || !number) {
      throw new InvalidApiPayloadError("Chapter descriptor is missing id or number.", {
        arrayIndex,
        raw: record,
      });
    }
    const branches = asArray(record.branches).map(parseBranch);
    return {
      id,
      index: asInteger(record.index),
      itemNumber: asInteger(record.item_number),
      volume,
      number,
      title: asNonEmptyString(record.name),
      bundleId: asInteger(record.bundle_id),
      branches,
      revisionKey: sha256(
        JSON.stringify({
          id,
          volume,
          number,
          branches: branches.map((branch) => ({
            revisionId: branch.revisionId,
            branchId: branch.branchId,
            createdAt: branch.createdAt,
          })),
        }),
      ),
      raw: record,
    };
  });
}

export function groupVolumes(chapters: ChapterDescriptor[]): VolumeDescriptor[] {
  const groups = new Map<string, ChapterDescriptor[]>();
  for (const chapter of chapters) {
    const current = groups.get(chapter.volume) ?? [];
    current.push(chapter);
    groups.set(chapter.volume, current);
  }
  return [...groups.entries()].map(([number, grouped]) => ({ number, chapters: grouped }));
}

export function parseChapter(
  raw: unknown,
  descriptor: ChapterDescriptor,
  sourceBaseUrl: string,
  slugUrl: string,
): Chapter {
  const record = asRecord(raw);
  const id = asInteger(record.id) ?? descriptor.id;
  const volume = asNonEmptyString(record.volume) ?? descriptor.volume;
  const number = asNonEmptyString(record.number) ?? descriptor.number;
  const branchId = asInteger(record.branch_id);
  const uploaderRecord = asRecord(record.user);
  const uploader = Object.keys(uploaderRecord).length > 0 ? parseUploader(uploaderRecord) : null;
  const fetchedAt = nowIso();
  const humanBase = sourceBaseUrl.replace(/\/+$/, "");

  return {
    id,
    mangaId: asInteger(record.manga_id),
    volume,
    number,
    title: asNonEmptyString(record.name) ?? descriptor.title,
    branchId,
    teams: asArray(record.teams).map(parseTeam),
    uploader,
    dates: {
      createdAt: asNonEmptyString(record.created_at),
      publishAt: asNonEmptyString(record.publish_at),
      expiredAt: asNonEmptyString(record.expired_at),
    },
    moderated: asBoolean(record.moderated),
    likes: asInteger(record.likes_count),
    viewed: asBoolean(record.is_viewed),
    liked: asBoolean(record.is_liked),
    expirationType: asNonEmptyString(record.expired_type),
    translationQualityRating: asNumber(record.translation_quality_rating),
    bundle: record.bundle ?? null,
    content: normalizeChapterContent(record.content, record.attachments, sourceBaseUrl),
    sourceUrl: `${humanBase}/ru/book/${slugUrl}/read/v${encodeURIComponent(volume)}/c${encodeURIComponent(number)}`,
    fetchedAt,
    raw: record,
  };
}

export function parseCatalogPage(raw: unknown, sourceBaseUrl: string): CatalogPage {
  const record = asRecord(raw);
  const data = asArray(record.data);
  const meta = asRecord(record.meta);
  const page = asInteger(meta.current_page) ?? asInteger(meta.page) ?? 1;
  const perPage = asInteger(meta.per_page) ?? data.length;
  return {
    page,
    perPage,
    hasNextPage: asBoolean(meta.has_next_page) ?? false,
    items: data.map((item) => parseCatalogTitle(item, sourceBaseUrl)),
    rawMeta: meta,
  };
}

export function parseCatalogTitle(raw: unknown, sourceBaseUrl: string): CatalogTitle {
  const record = asRecord(raw);
  const id = asInteger(record.id);
  const slugUrl = asNonEmptyString(record.slug_url);
  if (id === null || !slugUrl) {
    throw new InvalidApiPayloadError("Catalog title is missing id or slug_url.", { raw: record });
  }
  return {
    id,
    slugUrl,
    name: asNonEmptyString(record.name) ?? slugUrl,
    russianName: asNonEmptyString(record.rus_name),
    englishName: asNonEmptyString(record.eng_name),
    sourceUrl: `${sourceBaseUrl.replace(/\/+$/, "")}/ru/book/${slugUrl}`,
    raw: record,
  };
}

function parseNamedEntity(raw: unknown): NamedEntity {
  const record = asRecord(raw);
  return {
    id: asInteger(record.id),
    name: asNonEmptyString(record.name) ?? asNonEmptyString(record.rus_name) ?? "Unknown",
    russianName: asNonEmptyString(record.rus_name),
    alternativeName: asNonEmptyString(record.alt_name),
    raw: record,
  };
}

function parseTeam(raw: unknown): Team {
  const record = asRecord(raw);
  const details = asRecord(record.details);
  return {
    id: asInteger(record.id),
    name: asNonEmptyString(record.name) ?? "Unknown",
    slugUrl: asNonEmptyString(record.slug_url),
    active: asBoolean(details.is_active),
    raw: record,
  };
}

function parseTaxonomy(raw: unknown): TaxonomyItem {
  const record = asRecord(raw);
  return {
    id: asInteger(record.id),
    name: asNonEmptyString(record.name) ?? "Unknown",
    adult: asBoolean(record.adult) ?? false,
    alert: asBoolean(record.alert) ?? false,
    spoiler:
      (asBoolean(record.is_media_spoiler) ?? false) ||
      (asBoolean(record.is_general_spoiler) ?? false),
    raw: record,
  };
}

function parseBranch(raw: unknown): TranslationBranch {
  const record = asRecord(raw);
  const userRecord = asRecord(record.user);
  return {
    revisionId: asInteger(record.id),
    branchId: asInteger(record.branch_id),
    createdAt: asNonEmptyString(record.created_at),
    teams: asArray(record.teams).map(parseTeam),
    uploader: Object.keys(userRecord).length > 0 ? parseUploader(userRecord) : null,
    raw: record,
  };
}

function parseUploader(record: UnknownRecord): Uploader {
  return {
    id: asInteger(record.id),
    username: asNonEmptyString(record.username) ?? asNonEmptyString(record.name),
    raw: record,
  };
}
