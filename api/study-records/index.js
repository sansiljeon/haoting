import { createListCreateHandler } from "../lib/record-route-handlers.js";
import { listRecords, appendRecord } from "../lib/google-sheets.js";

export default createListCreateHandler({
  store: { listRecords, appendRecord },
  logTag: "api/study-records",
  buildRecord: (body) => ({
    classDate: body.classDate,
    classType: body.classType || "",
    studentName: body.studentName,
    registeredSessions: body.registeredSessions || "",
    attendance: body.attendance || "",
    topic: body.topic || "",
    goal: body.goal || "",
    content: body.content || "",
    comprehension: body.comprehension || "",
    participation: body.participation || "",
    strengths: body.strengths || "",
    improvement: body.improvement || "",
    nextPlan: body.nextPlan || "",
    teacherMemo: body.teacherMemo || "",
  }),
});
