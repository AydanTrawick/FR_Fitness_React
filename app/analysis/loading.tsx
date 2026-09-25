export default function Loading() {
  return (
    <main style={{ padding: 40 }} aria-busy="true">
      <h1>Your Analysis</h1>
      <p role="status">Loading your activity…</p>
    </main>
  );
}
