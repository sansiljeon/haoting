import { createItemHandler } from "../lib/record-route-handlers.js";
import { updateRecordById, deleteById } from "../lib/google-sheets-homework.js";

export default createItemHandler({
  store: { updateRecordById, deleteById },
  logTag: "api/homework-records/:id",
});
