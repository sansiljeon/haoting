import { createListCreateHandler } from "../lib/record-route-handlers.js";
import { listRecords, appendRecord } from "../lib/google-sheets-homework.js";

export default createListCreateHandler({
  store: { listRecords, appendRecord },
  logTag: "api/homework-records",
  buildRecord: (body) => ({
    classDate: body.classDate,
    classType: body.classType || "",
    studentName: body.studentName,
    registeredSessions: body.registeredSessions || "",
    content: body.content || "",
    homeworkText: body.homeworkText || "",
    submitted: body.submitted || "미제출",
    checked: body.checked || "미확인",
    feedback: body.feedback || "",
    recheck: body.recheck || "",
    nextCheckDate: body.nextCheckDate || "",
    memo: body.memo || "",
  }),
});
