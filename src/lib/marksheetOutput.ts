import { paginateMarksheet } from "./marksheetPagination";

/** Print and PDF consume the same measured, static page DOM. No grading happens here. */
export function createMarksheetOutput(source: HTMLElement): HTMLDivElement {
  const output = document.createElement("div");
  output.className = "marksheet-output";
  output.id = "primary-marksheet-output";
  document.body.append(output);
  // Mounted last: globally imported Nursery/report rules must not hide this body child.
  const printStyle = document.createElement("style");
  printStyle.media = "print";
  printStyle.textContent = `
    @page { size: A4 landscape; margin: 8mm; }
    body:has(> .marksheet-output) > #root { display: none !important; }
    html:has(#primary-marksheet-output), body:has(#primary-marksheet-output) { width: 281mm !important; }
    body > #primary-marksheet-output { display: block !important; position: static !important; }
    body > #primary-marksheet-output .marksheet-measure { display: block !important; }
  `;
  output.append(printStyle);
  try {
    const measured = source.cloneNode(true) as HTMLElement;
    measured.classList.add("marks-form--pdf-export", "marksheet-page", "marksheet-measure");
    measured.querySelectorAll("style").forEach(style => style.remove());
    const sourceInputs = source.querySelectorAll("input");
    measured.querySelectorAll("input").forEach((input, index) => {
      const value = document.createElement("span");
      value.className = "marksheet-mark";
      value.textContent = sourceInputs[index]?.value ?? "";
      input.replaceWith(value);
    });
    output.append(measured);
    const header = measured.querySelector<HTMLElement>(".marks-form__header");
    const table = measured.querySelector<HTMLTableElement>(".marks-form__table");
    const scale = measured.querySelector<HTMLElement>(".marks-form__grading-scale");
    const summaries = measured.querySelector<HTMLElement>(".marks-form__summary-grid");
    const footer = measured.querySelector<HTMLElement>(".marks-form__footer");
    if (!header || !table || !scale || !summaries || !footer || !table.tHead) {
      throw new Error("Select a class before printing the marksheet.");
    }
    const height = (element: Element) => element.getBoundingClientRect().height;
    const rows = Array.from(table.tBodies[0]?.rows ?? []).filter(row => !row.classList.contains("pad-row"));
    // Include border rounding, all inter-section gaps and the repeating footer in the reservation.
    const reserved = height(header) + 6 + height(table.tHead) + height(scale) + height(footer) + 32;
    const plans = paginateMarksheet(rows.map(height), height(measured) - reserved, height(summaries) + 8);
    for (const [index, plan] of plans.entries()) {
      const page = document.createElement("div");
      page.className = "marks-form marks-form--pdf-export marksheet-page";
      page.dataset.page = String(index + 1);
      page.append(header.cloneNode(true));
      if (plan.rowIndexes.length) {
        const pageTable = table.cloneNode(false) as HTMLTableElement;
        pageTable.append(table.tHead.cloneNode(true));
        const body = document.createElement("tbody");
        plan.rowIndexes.forEach(rowIndex => body.append(rows[rowIndex].cloneNode(true)));
        pageTable.append(body);
        page.append(pageTable);
      }
      const bottom = document.createElement("div");
      bottom.className = "marksheet-page__bottom";
      bottom.append(scale.cloneNode(true));
      if (plan.summaries) bottom.append(summaries.cloneNode(true));
      bottom.append(footer.cloneNode(true));
      page.append(bottom);
      output.append(page);
    }
    measured.remove();
    return output;
  } catch (error) {
    output.remove();
    throw error;
  }
}