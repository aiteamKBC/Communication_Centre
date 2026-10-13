/** Screens for integrations the reference Engagement Centre has but this deployment has not connected yet. */
export function Eventbrite() {
  return (
    <>
      <section className="ec-card">
        <div className="ec-eyebrow">Director connections</div>
        <h2>Eventbrite</h2>
        <p>Connect each college organiser account, then browse its events and registrations.</p>
        <p className="ec-muted">Refreshing the calling queues will import tomorrow’s registered attendees into Next Day once Eventbrite is connected.</p>
      </section>
      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <h3>Connect an organiser account</h3>
        <p>Enter the <strong>private token</strong> from your Eventbrite app. It is encrypted when saved and is never displayed again.</p>
        <form className="ec-form" autoComplete="off" onSubmit={event => event.preventDefault()}>
          <label>Account label<input name="label" maxLength={100} placeholder="KBC events" disabled /></label>
          <label>Private token<input type="password" name="private_token" disabled /></label>
          <button type="submit" className="primary" disabled>Verify and save connection</button>
        </form>
        <p>Secure token storage is awaiting activation.</p>
      </section>
      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <h3>Browse current and upcoming events</h3>
        <p>No organiser accounts have been connected yet.</p>
      </section>
    </>
  );
}
