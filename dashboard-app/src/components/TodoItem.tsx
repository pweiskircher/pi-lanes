import type {LaneTodo} from "../types";
import type {TodoDraft} from "../ui";

type TodoItemProps = {
  readonly todo: LaneTodo;
  readonly draft: TodoDraft;
  readonly onDraftChange: (draft: TodoDraft) => void;
  readonly onSave: () => void;
  readonly onSetStatus: (status: string) => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onDelete: () => void;
};

export function TodoItem(props: TodoItemProps) {
  const {todo, draft, onDraftChange, onSave, onSetStatus, onApprove, onReject, onDelete} = props;

  return (
    <div class="todo-card">
      <div class="message-header">
        <div>
          <strong>{todo.id}</strong> <span class={`status-${todo.status}`}>[{todo.status}]</span>
        </div>
        <div class="actions-row">
          {todo.status === "proposed" ? (
            <>
              <button type="button" onClick={onApprove}>Approve</button>
              <button type="button" onClick={onReject}>Reject</button>
            </>
          ) : null}
          <button type="button" onClick={onDelete}>Delete</button>
        </div>
      </div>
      <div class="todo-edit-row">
        <input type="text" value={draft.title} onInput={event => onDraftChange({...draft, title: event.currentTarget.value})} />
        <select value={draft.priority} onChange={event => onDraftChange({...draft, priority: event.currentTarget.value})}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <select value={todo.status} onChange={event => onSetStatus(event.currentTarget.value)}>
          <option value="open">open</option>
          <option value="in_progress">in_progress</option>
          <option value="blocked">blocked</option>
          <option value="done">done</option>
          <option value="dropped">dropped</option>
        </select>
      </div>
      <textarea value={draft.notes} onInput={event => onDraftChange({...draft, notes: event.currentTarget.value})} />
      <div class="actions-row">
        <button type="button" onClick={onSave}>Save</button>
      </div>
      {todo.proposalReason ? <div class="muted">Reason: {todo.proposalReason}</div> : null}
    </div>
  );
}
