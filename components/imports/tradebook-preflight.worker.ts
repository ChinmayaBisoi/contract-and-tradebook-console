import ExcelJS from "exceljs";

type PreflightSummary = {
  sheets: Array<{ name: string; rowCount: number; columnCount: number }>;
  formulaCount: number;
};

type WorkerResponse =
  | { type: "complete"; summary: PreflightSummary }
  | { type: "error"; message: string };

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Workbook preflight parsing failed.";
}

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(event.data);
    const summary: PreflightSummary = {
      sheets: workbook.worksheets.map((sheet) => ({
        name: sheet.name,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
      })),
      formulaCount: workbook.worksheets.reduce((count, sheet) => {
        let sheetFormulaCount = 0;
        for (let row = 1; row <= sheet.rowCount; row += 1) {
          for (let column = 1; column <= sheet.columnCount; column += 1) {
            if (sheet.getCell(row, column).formula) {
              sheetFormulaCount += 1;
            }
          }
        }
        return count + sheetFormulaCount;
      }, 0),
    };
    const response: WorkerResponse = { type: "complete", summary };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: "error",
      message: toErrorMessage(error),
    };
    self.postMessage(response);
  }
};
