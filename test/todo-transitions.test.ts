import test from "node:test";
import assert from "node:assert/strict";
import {
  approveProposedTodo,
  createHumanTodo,
  deleteTodo,
  editTodo,
  rejectProposedTodo,
  setTodoStatus,
} from "../src/functional-core/todo-transitions.js";
import type {LaneTodoFile} from "../src/types.js";

test("createHumanTodo appends an open todo", () => {
  const todoFile: LaneTodoFile = {
    laneId: "mt-core",
    todos: [],
  };

  const result = createHumanTodo(todoFile, {
    id: "todo-001",
    title: "Measure contention",
    priority: "high",
    notes: null,
    now: "2026-03-07T14:00:00Z",
  });

  assert.equal(result.success, true);
  if (!result.success) {
    return;
  }

  assert.equal(result.data.todos.length, 1);
  assert.deepEqual(result.data.todos[0], {
    id: "todo-001",
    title: "Measure contention",
    notes: null,
    status: "open",
    priority: "high",
    createdBy: "human",
    needsReview: false,
    proposalReason: null,
    createdAt: "2026-03-07T14:00:00Z",
    updatedAt: "2026-03-07T14:00:00Z",
  });
});

test("approveProposedTodo promotes an llm todo to open", () => {
  const todoFile = createProposedTodoFile();
  const result = approveProposedTodo(todoFile, "todo-002", "2026-03-07T14:10:00Z");

  assert.equal(result.success, true);
  if (!result.success) {
    return;
  }

  assert.equal(result.data.todos[0]?.status, "open");
  assert.equal(result.data.todos[0]?.needsReview, false);
});

test("rejectProposedTodo drops an llm todo", () => {
  const todoFile = createProposedTodoFile();
  const result = rejectProposedTodo(todoFile, "todo-002", "2026-03-07T14:10:00Z");

  assert.equal(result.success, true);
  if (!result.success) {
    return;
  }

  assert.equal(result.data.todos[0]?.status, "dropped");
  assert.equal(result.data.todos[0]?.needsReview, false);
});

test("approveProposedTodo rejects non-proposed todos", () => {
  const todoFile: LaneTodoFile = {
    laneId: "pdfua-paragraphs",
    todos: [
      {
        id: "todo-002",
        title: "Check nested spans",
        notes: null,
        status: "open",
        priority: "medium",
        createdBy: "human",
        needsReview: false,
        proposalReason: null,
        createdAt: "2026-03-07T14:00:00Z",
        updatedAt: "2026-03-07T14:00:00Z",
      },
    ],
  };

  const result = approveProposedTodo(todoFile, "todo-002", "2026-03-07T14:10:00Z");

  assert.equal(result.success, false);
  if (result.success) {
    return;
  }

  assert.match(result.issues[0]?.message ?? "", /not created by the llm/);
});

test("setTodoStatus updates a human todo status", () => {
  const todoFile = createOpenHumanTodoFile();
  const result = setTodoStatus(todoFile, "todo-001", "blocked", "2026-03-07T14:10:00Z");

  assert.equal(result.success, true);
  if (!result.success) {
    return;
  }

  assert.equal(result.data.todos[0]?.status, "blocked");
  assert.equal(result.data.todos[0]?.updatedAt, "2026-03-07T14:10:00Z");
});

test("setTodoStatus rejects status changes for unreviewed llm proposals", () => {
  const todoFile = createProposedTodoFile();
  const result = setTodoStatus(todoFile, "todo-002", "blocked", "2026-03-07T14:10:00Z");

  assert.equal(result.success, false);
  if (result.success) {
    return;
  }

  assert.match(result.issues[0]?.message ?? "", /must be approved or rejected/);
});

test("editTodo updates title, notes, and priority", () => {
  const todoFile = createOpenHumanTodoFile();
  const result = editTodo(
    todoFile,
    "todo-001",
    {
      title: "Measure renderer contention",
      notes: "Focus on page cache contention.",
      priority: "high",
    },
    "2026-03-07T14:10:00Z",
  );

  assert.equal(result.success, true);
  if (!result.success) {
    return;
  }

  assert.deepEqual(result.data.todos[0], {
    id: "todo-001",
    title: "Measure renderer contention",
    notes: "Focus on page cache contention.",
    status: "open",
    priority: "high",
    createdBy: "human",
    needsReview: false,
    proposalReason: null,
    createdAt: "2026-03-07T14:00:00Z",
    updatedAt: "2026-03-07T14:10:00Z",
  });
});

test("deleteTodo removes a todo by id", () => {
  const todoFile: LaneTodoFile = {
    laneId: "mt-core",
    todos: [createHumanTodoRecord(), createSecondHumanTodoRecord()],
  };

  const result = deleteTodo(todoFile, "todo-001");

  assert.equal(result.success, true);
  if (!result.success) {
    return;
  }

  assert.equal(result.data.todos.length, 1);
  assert.equal(result.data.todos[0]?.id, "todo-002");
});

function createOpenHumanTodoFile(): LaneTodoFile {
  return {
    laneId: "mt-core",
    todos: [createHumanTodoRecord()],
  };
}

function createProposedTodoFile(): LaneTodoFile {
  return {
    laneId: "pdfua-paragraphs",
    todos: [
      {
        id: "todo-002",
        title: "Check nested spans",
        notes: null,
        status: "proposed",
        priority: "medium",
        createdBy: "llm",
        needsReview: true,
        proposalReason: "Observed a grouping mismatch.",
        createdAt: "2026-03-07T14:00:00Z",
        updatedAt: "2026-03-07T14:00:00Z",
      },
    ],
  };
}

function createHumanTodoRecord() {
  return {
    id: "todo-001",
    title: "Measure contention",
    notes: null,
    status: "open",
    priority: "medium",
    createdBy: "human",
    needsReview: false,
    proposalReason: null,
    createdAt: "2026-03-07T14:00:00Z",
    updatedAt: "2026-03-07T14:00:00Z",
  } as const;
}

function createSecondHumanTodoRecord() {
  return {
    id: "todo-002",
    title: "Trace ownership",
    notes: null,
    status: "open",
    priority: "low",
    createdBy: "human",
    needsReview: false,
    proposalReason: null,
    createdAt: "2026-03-07T14:05:00Z",
    updatedAt: "2026-03-07T14:05:00Z",
  } as const;
}
