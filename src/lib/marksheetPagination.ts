export type MarksheetPage = { rowIndexes: number[]; summaries: boolean };

/** Heights are measured from the actual landscape sheet, not estimated row counts. */
export function paginateMarksheet(rowHeights: number[], rowSpace: number, summaryHeight: number): MarksheetPage[] {
  if (rowSpace <= 0 || summaryHeight > rowSpace || rowHeights.some(height => height > rowSpace)) {
    throw new Error("The marksheet contains a row or summary taller than the printable page.");
  }
  const pages: MarksheetPage[] = [];
  let rowIndexes: number[] = [];
  let used = 0;
  rowHeights.forEach((height, index) => {
    if (used + height > rowSpace && rowIndexes.length) {
      pages.push({ rowIndexes, summaries: false });
      rowIndexes = [];
      used = 0;
    }
    rowIndexes.push(index);
    used += height;
  });
  if (used + summaryHeight <= rowSpace) {
    pages.push({ rowIndexes, summaries: true });
  } else {
    pages.push({ rowIndexes, summaries: false }, { rowIndexes: [], summaries: true });
  }
  return pages;
}