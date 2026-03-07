type SettingsTabProps = {
  readonly contextText: string;
  readonly onContextTextChange: (value: string) => void;
  readonly onSaveContext: () => void;
};

export function SettingsTab(props: SettingsTabProps) {
  const {contextText, onContextTextChange, onSaveContext} = props;

  return (
    <section class="panel">
      <div class="tab-panel-header">
        <div>
          <h3>Lane context</h3>
          <div class="muted">Always-visible lane notes used to ground future work.</div>
        </div>
      </div>
      <textarea class="settings-context-textarea" value={contextText} onInput={event => onContextTextChange(event.currentTarget.value)} />
      <div class="actions-row compact-actions-row">
        <button type="button" onClick={onSaveContext}>Save context</button>
      </div>
    </section>
  );
}
