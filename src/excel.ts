import { Task, TaskRowData } from "./types";

const defaultHeaders = ["Reg", "Model", "Colour", "Peg Number"];

export function parsePastedTable(input: string) {
  const rows = input
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,/).map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));

  if (rows.length === 0) return { headers: defaultHeaders, rows: [] };

  const firstRow = rows[0];
  const looksLikeHeader = firstRow.some((cell) =>
    /reg|model|colour|color|peg|stock|vin|notes?/i.test(cell)
  );
  const headers = looksLikeHeader
    ? firstRow.map((header, index) => header || `Column ${index + 1}`)
    : defaultHeaders.slice(0, Math.max(defaultHeaders.length, firstRow.length));
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  return {
    headers,
    rows: dataRows.map((row) => ({
      id: crypto.randomUUID(),
      values: Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""])
      ),
    })) satisfies TaskRowData[],
  };
}

export function rowTitle(row: TaskRowData) {
  const values = row.values;
  const reg = findValue(values, ["Reg", "Registration", "VRM"]);
  const model = findValue(values, ["Model", "Vehicle", "Car"]);
  const colour = findValue(values, ["Colour", "Color"]);
  const peg = findValue(values, ["Peg Number", "Peg", "Stock"]);

  return [reg, model, colour, peg && `Peg ${peg}`].filter(Boolean).join(" · ") || "Vehicle task";
}

export function makeChildTasks(parent: Task, rows: TaskRowData[], author: string, userId: string | null): Task[] {
  const now = new Date().toISOString();

  return rows.map((row) => ({
    id: crypto.randomUUID(),
    parentId: parent.id,
    site: parent.site,
    title: rowTitle(row),
    status: "new",
    createdByUserId: userId,
    takenByUserId: null,
    completedByUserId: null,
    createdBy: author,
    takenBy: null,
    completedBy: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    note: "",
    rowData: row,
  }));
}

function findValue(values: Record<string, string>, candidates: string[]) {
  const entry = Object.entries(values).find(([key]) =>
    candidates.some((candidate) => key.toLowerCase() === candidate.toLowerCase())
  );

  return entry?.[1]?.trim();
}
