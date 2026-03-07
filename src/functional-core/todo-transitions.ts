// pattern: Functional Core

import type {CreateHumanTodoOptions, LaneTodo, LaneTodoFile, TodoPriority, TodoStatus, ValidationResult} from "../types.js";

const editableStatuses = new Set<TodoStatus>(["open", "in_progress", "blocked", "done", "dropped"]);

export function createHumanTodo(
  todoFile: LaneTodoFile,
  options: CreateHumanTodoOptions,
): ValidationResult<LaneTodoFile> {
  if (todoFile.todos.some(todo => todo.id === options.id)) {
    return {
      success: false,
      issues: [{path: `todos.${options.id}`, message: "todo id already exists"}],
    };
  }

  const todo: LaneTodo = {
    id: options.id,
    title: options.title,
    notes: options.notes,
    status: "open",
    priority: options.priority,
    createdBy: "human",
    needsReview: false,
    proposalReason: null,
    createdAt: options.now,
    updatedAt: options.now,
  };

  return {
    success: true,
    data: {
      laneId: todoFile.laneId,
      todos: [...todoFile.todos, todo],
    },
  };
}

export function approveProposedTodo(todoFile: LaneTodoFile, todoId: string, now: string): ValidationResult<LaneTodoFile> {
  return updateTodo(todoFile, todoId, now, todo => {
    if (todo.createdBy !== "llm") {
      return invalid(`todo ${todoId} was not created by the llm`);
    }
    if (todo.status !== "proposed") {
      return invalid(`todo ${todoId} is not in proposed status`);
    }

    return valid({
      ...todo,
      status: "open",
      needsReview: false,
    });
  });
}

export function rejectProposedTodo(todoFile: LaneTodoFile, todoId: string, now: string): ValidationResult<LaneTodoFile> {
  return updateTodo(todoFile, todoId, now, todo => {
    if (todo.createdBy !== "llm") {
      return invalid(`todo ${todoId} was not created by the llm`);
    }
    if (todo.status !== "proposed") {
      return invalid(`todo ${todoId} is not in proposed status`);
    }

    return valid({
      ...todo,
      status: "dropped",
      needsReview: false,
    });
  });
}

export function markTodoInProgress(todoFile: LaneTodoFile, todoId: string, now: string): ValidationResult<LaneTodoFile> {
  return updateTodo(todoFile, todoId, now, todo => {
    if (todo.status !== "open" && todo.status !== "blocked") {
      return invalid(`todo ${todoId} must be open or blocked before it can move to in_progress`);
    }

    return valid({
      ...todo,
      status: "in_progress",
    });
  });
}

export function setTodoStatus(
  todoFile: LaneTodoFile,
  todoId: string,
  status: TodoStatus,
  now: string,
): ValidationResult<LaneTodoFile> {
  if (!editableStatuses.has(status)) {
    return invalid(`status ${status} is not supported by manual status editing`);
  }

  return updateTodo(todoFile, todoId, now, todo => {
    if (todo.createdBy === "llm" && todo.status === "proposed") {
      return invalid(`todo ${todoId} must be approved or rejected before normal status changes`);
    }

    return valid({
      ...todo,
      status,
    });
  });
}

export function editTodo(
  todoFile: LaneTodoFile,
  todoId: string,
  updates: {
    readonly title: string | null;
    readonly notes: string | null;
    readonly priority: TodoPriority | null;
  },
  now: string,
): ValidationResult<LaneTodoFile> {
  if (updates.title === null && updates.notes === null && updates.priority === null) {
    return invalid("at least one field must be updated");
  }

  return updateTodo(todoFile, todoId, now, todo => {
    const nextTitle = updates.title ?? todo.title;
    if (nextTitle.trim().length === 0) {
      return invalid("todo title cannot be empty");
    }

    return valid({
      ...todo,
      title: nextTitle,
      notes: updates.notes ?? todo.notes,
      priority: updates.priority ?? todo.priority,
    });
  });
}

export function deleteTodo(todoFile: LaneTodoFile, todoId: string): ValidationResult<LaneTodoFile> {
  const remainingTodos = todoFile.todos.filter(todo => todo.id !== todoId);
  if (remainingTodos.length === todoFile.todos.length) {
    return {
      success: false,
      issues: [{path: `todos.${todoId}`, message: "todo not found"}],
    };
  }

  return {
    success: true,
    data: {
      laneId: todoFile.laneId,
      todos: remainingTodos,
    },
  };
}

function updateTodo(
  todoFile: LaneTodoFile,
  todoId: string,
  now: string,
  transform: (todo: LaneTodo) => ValidationResult<LaneTodo>,
): ValidationResult<LaneTodoFile> {
  let found = false;
  let transitionError: string | null = null;

  const updatedTodos = todoFile.todos.map(todo => {
    if (todo.id !== todoId) {
      return todo;
    }
    found = true;

    const result = transform(todo);
    if (!result.success) {
      transitionError = result.issues[0]?.message ?? "invalid todo transition";
      return todo;
    }

    return {
      ...result.data,
      updatedAt: now,
    };
  });

  if (!found) {
    return {
      success: false,
      issues: [{path: `todos.${todoId}`, message: "todo not found"}],
    };
  }

  if (transitionError !== null) {
    return {
      success: false,
      issues: [{path: `todos.${todoId}`, message: transitionError}],
    };
  }

  return {
    success: true,
    data: {
      laneId: todoFile.laneId,
      todos: updatedTodos,
    },
  };
}

function valid<T>(data: T): ValidationResult<T> {
  return {success: true, data};
}

function invalid(message: string): ValidationResult<never> {
  return {success: false, issues: [{path: "$", message}]};
}
