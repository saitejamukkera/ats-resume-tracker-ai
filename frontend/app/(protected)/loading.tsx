export default function ProtectedLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <span>Loading workspace…</span>
    </div>
  );
}
