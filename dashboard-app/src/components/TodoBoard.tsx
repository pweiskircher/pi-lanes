import type {LaneSnapshot, LaneTodo} from "../types";
import type {TodoDraft, TodoGroups} from "../ui";
import {TodoItem} from "./TodoItem";

type TodoBoardProps = {
  readonly lane: LaneSnapshot;
  readonly todoGroups: TodoGroups;
  readonly todoDrafts: Record<string, TodoDraft>;
  readonly newTodo: {readonly title: string; readonly priority: string; readonly notes: string};
  readonly onNewTodoChange: (value: {readonly title: string; readonly priority: string; readonly notes: string}) => void;
  readonly onDraftChange: (todoId: string, draft: TodoDraft) => void;
  readonly onCreateTodo: () => void;
  readonly onSaveTodo: (todoId: string) => void;
  readonly onSetStatus: (todoId: string, status: string) => void;
  readonly onApprove: (todoId: string) => void;
  readonly onReject: (todoId: string) => void;
  readonly onDelete: (todoId: string) => void;
};

export function TodoBoard(props: TodoBoardProps) {
  const {lane, todoGroups, todoDrafts, newTodo, onNewTodoChange, onDraftChange, onCreateTodo, onSaveTodo, onSetStatus, onApprove, onReject, onDelete} = props;

  return (
    <>
      <section class="panel">
        <div class="todo-summary-grid">
          <TodoSummaryCard label="In progress" count={lane.todoCounts.inProgress} tone="in_progress" />
          <TodoSummaryCard label="Open" count={lane.todoCounts.open} tone="open" />
          <TodoSummaryCard label="Proposed" count={lane.todoCounts.proposed} tone="proposed" />
          <TodoSummaryCard label="Blocked" count={lane.todoCounts.blocked} tone="blocked" />
        </div>
      </section>

      <section class="panel">
        <h3>Add TODO</h3>
        <div class="todo-create-row">
          <input type="text" value={newTodo.title} placeholder="TODO title" onInput={event => onNewTodoChange({...newTodo, title: event.currentTarget.value})} />
          <select value={newTodo.priority} onChange={event => onNewTodoChange({...newTodo, priority: event.currentTarget.value})}>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="low">low</option>
          </select>
          <button type="button" onClick={onCreateTodo}>Add</button>
        </div>
        <textarea value={newTodo.notes} placeholder="Optional notes" onInput={event => onNewTodoChange({...newTodo, notes: event.currentTarget.value})} />
      </section>

      <TodoGroupSection title="Current work" emptyLabel="No TODOs in progress." todos={todoGroups.inProgress} todoDrafts={todoDrafts} onDraftChange={onDraftChange} onSaveTodo={onSaveTodo} onSetStatus={onSetStatus} onApprove={onApprove} onReject={onReject} onDelete={onDelete} />
      <TodoGroupSection title="Open" emptyLabel="No open TODOs." todos={todoGroups.open} todoDrafts={todoDrafts} onDraftChange={onDraftChange} onSaveTodo={onSaveTodo} onSetStatus={onSetStatus} onApprove={onApprove} onReject={onReject} onDelete={onDelete} />
      <TodoGroupSection title="Proposed" emptyLabel="No proposed TODOs." todos={todoGroups.proposed} todoDrafts={todoDrafts} onDraftChange={onDraftChange} onSaveTodo={onSaveTodo} onSetStatus={onSetStatus} onApprove={onApprove} onReject={onReject} onDelete={onDelete} />
      <TodoGroupSection title="Blocked" emptyLabel="No blocked TODOs." todos={todoGroups.blocked} todoDrafts={todoDrafts} onDraftChange={onDraftChange} onSaveTodo={onSaveTodo} onSetStatus={onSetStatus} onApprove={onApprove} onReject={onReject} onDelete={onDelete} />

      <section class="panel">
        <details>
          <summary>Done and dropped</summary>
          <div class="section-gap todo-list">
            {renderTodoList(todoGroups.done, todoDrafts, onDraftChange, onSaveTodo, onSetStatus, onApprove, onReject, onDelete)}
            {renderTodoList(todoGroups.dropped, todoDrafts, onDraftChange, onSaveTodo, onSetStatus, onApprove, onReject, onDelete)}
            {todoGroups.done.length === 0 && todoGroups.dropped.length === 0 ? <div class="muted">No done or dropped TODOs.</div> : null}
          </div>
        </details>
      </section>
    </>
  );
}

type TodoGroupSectionProps = {
  readonly title: string;
  readonly emptyLabel: string;
  readonly todos: ReadonlyArray<LaneTodo>;
  readonly todoDrafts: Record<string, TodoDraft>;
  readonly onDraftChange: (todoId: string, draft: TodoDraft) => void;
  readonly onSaveTodo: (todoId: string) => void;
  readonly onSetStatus: (todoId: string, status: string) => void;
  readonly onApprove: (todoId: string) => void;
  readonly onReject: (todoId: string) => void;
  readonly onDelete: (todoId: string) => void;
};

function TodoGroupSection(props: TodoGroupSectionProps) {
  const {title, emptyLabel, todos, todoDrafts, onDraftChange, onSaveTodo, onSetStatus, onApprove, onReject, onDelete} = props;

  return (
    <section class="panel">
      <div class="todo-group-header">
        <h3>{title}</h3>
        <span class="pill">{todos.length}</span>
      </div>
      <div class="todo-list">
        {todos.length === 0 ? <div class="muted">{emptyLabel}</div> : renderTodoList(todos, todoDrafts, onDraftChange, onSaveTodo, onSetStatus, onApprove, onReject, onDelete)}
      </div>
    </section>
  );
}

function TodoSummaryCard(props: {readonly label: string; readonly count: number; readonly tone: string}) {
  return (
    <div class={`todo-summary-card ${props.tone}`}>
      <div class="muted">{props.label}</div>
      <div class="todo-summary-count">{props.count}</div>
    </div>
  );
}

function renderTodoList(
  todos: ReadonlyArray<LaneTodo>,
  todoDrafts: Record<string, TodoDraft>,
  onDraftChange: (todoId: string, draft: TodoDraft) => void,
  onSaveTodo: (todoId: string) => void,
  onSetStatus: (todoId: string, status: string) => void,
  onApprove: (todoId: string) => void,
  onReject: (todoId: string) => void,
  onDelete: (todoId: string) => void,
) {
  return todos.map(todo => (
    <TodoItem
      key={todo.id}
      todo={todo}
      draft={todoDrafts[todo.id] ?? {title: todo.title, priority: todo.priority, notes: todo.notes ?? ""}}
      onDraftChange={draft => onDraftChange(todo.id, draft)}
      onSave={() => onSaveTodo(todo.id)}
      onSetStatus={status => onSetStatus(todo.id, status)}
      onApprove={() => onApprove(todo.id)}
      onReject={() => onReject(todo.id)}
      onDelete={() => onDelete(todo.id)}
    />
  ));
}
