import { AmbiguousTranslationError, BranchNotFoundError, InvalidInputError } from "./errors.js";
import type { BranchSelector, ChapterDescriptor, TranslationBranch } from "./types.js";

export async function resolveBranch(
  title: string,
  chapter: ChapterDescriptor,
  selector: BranchSelector = "error",
): Promise<TranslationBranch | null> {
  const branches = chapter.branches;
  if (branches.length === 0) return null;
  if (branches.length === 1) return branches[0] ?? null;

  if (typeof selector === "function") {
    const selected = await selector({ title, chapter, branches });
    if (selected === null) throw new AmbiguousTranslationError(chapter);
    if (typeof selected === "number") return findBranch(chapter, selected);
    const match = branches.find(
      (branch) =>
        branch === selected ||
        (selected.branchId !== null && branch.branchId === selected.branchId) ||
        (selected.revisionId !== null && branch.revisionId === selected.revisionId),
    );
    if (!match) {
      throw new InvalidInputError("Branch selector returned a branch outside this chapter.", {
        volume: chapter.volume,
        number: chapter.number,
      });
    }
    return match;
  }

  if (typeof selector === "object") {
    if ("branchId" in selector) return findBranch(chapter, selector.branchId);
    const branch = branches[selector.translationIndex];
    if (!branch) {
      throw new InvalidInputError("translationIndex is outside the chapter branch list.", {
        volume: chapter.volume,
        number: chapter.number,
        translationIndex: selector.translationIndex,
        branchCount: branches.length,
      });
    }
    return branch;
  }

  switch (selector) {
    case "error":
      throw new AmbiguousTranslationError(chapter);
    case "first":
      return branches[0] ?? null;
    case "latest":
      return [...branches].sort(compareBranchDates).at(-1) ?? branches[0] ?? null;
    case "oldest":
      return [...branches].sort(compareBranchDates)[0] ?? null;
    default:
      throw new InvalidInputError(`Unknown branch strategy: ${String(selector)}`);
  }
}

export function ambiguousChapters(chapters: ChapterDescriptor[]): ChapterDescriptor[] {
  return chapters.filter((chapter) => chapter.branches.length > 1);
}

function findBranch(chapter: ChapterDescriptor, branchId: number): TranslationBranch {
  const branch = chapter.branches.find((candidate) => candidate.branchId === branchId);
  if (!branch) throw new BranchNotFoundError(chapter, branchId);
  return branch;
}

function compareBranchDates(left: TranslationBranch, right: TranslationBranch): number {
  const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return (left.revisionId ?? 0) - (right.revisionId ?? 0);
}
