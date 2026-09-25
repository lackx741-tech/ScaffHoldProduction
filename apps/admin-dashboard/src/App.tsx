import './App.css';

const navigation = ['Campaigns', 'Contracts', 'Integrations', 'Domains', 'Compilation'];

const serviceCards = [
  {
    title: 'Orchestrator API',
    subtitle: 'Campaign, contract, integration, and domain orchestration',
    endpoint: '/api/v1/campaigns'
  },
  {
    title: 'Scanner Service',
    subtitle: 'Read-only chain state, balances, allowances, NFTs, receipts',
    endpoint: '/scanner/v1/chains/:chainId/status'
  },
  {
    title: 'Transaction Engine',
    subtitle: 'Client runtime: connect, simulate, approve, wallet-submitted tx, status',
    endpoint: '/tx-engine/v1/prepare'
  },
  {
    title: 'Compilation Service',
    subtitle: 'Emits the standalone project-runtime.min.js and its stable download URL',
    endpoint: '/compilation/v1/compile'
  }
];

const checklist = [
  'Client-side signing through the end user wallet (no server keys)',
  'Domain verification and authorization enforcement',
  'Contract and method allowlists with audited simulation',
  'Rate limiting, idempotency, nonce locking, and audit logging'
];

function App() {
  return (
    <main className="layout">
      <header className="hero">
        <p className="eyebrow">ScaffHoldProduction</p>
        <h1>Distributed Web3 campaign platform scaffold</h1>
        <p className="lede">
          The control panel compiles a campaign into a standalone JavaScript runtime. Customers
          load that one file and drop the <code>interact-button</code> class on any element to
          open the WalletConnect popup and run contract calls.
        </p>
      </header>

      <nav aria-label="Primary" className="nav-shell">
        {navigation.map((item) => (
          <button key={item} type="button" className="nav-pill">
            {item}
          </button>
        ))}
      </nav>

      <section className="grid">
        <article className="panel feature-panel">
          <h2>Campaign workspace</h2>
          <ul className="stack-list">
            <li>Environment-aware campaign metadata</li>
            <li>Allowlisted contract/method configuration</li>
            <li>WalletConnect v2 provider, modal theme, and configured action</li>
            <li>Compilation and domain verification orchestration entry points</li>
          </ul>
        </article>

        <article className="panel feature-panel">
          <h2>Compiled deliverable</h2>
          <div className="artifact-card">
            <span className="artifact-version">project-runtime.min.js</span>
            <p>
              A single standalone JavaScript file with the chain, RPC, contract, ABI, theme and
              action baked in. Download it or serve it from its stable URL.
            </p>
            <code>{'<script src="project-runtime.min.js" defer></script>'}</code>
            <p>
              Any element with the <code>interact-button</code> class becomes a WalletConnect
              trigger. No other integration code is required.
            </p>
            <code>{'<button class="interact-button">Connect Wallet</button>'}</code>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Service boundaries</h2>
          <p>Each service starts independently and exposes health/readiness endpoints.</p>
        </div>
        <div className="service-grid">
          {serviceCards.map((card) => (
            <article key={card.title} className="service-card">
              <h3>{card.title}</h3>
              <p>{card.subtitle}</p>
              <code>{card.endpoint}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="panel split-panel">
        <div>
          <h2>Scaffold-only safety guardrails</h2>
          <ul className="stack-list">
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Local development</h2>
          <ol className="stack-list ordered">
            <li>Copy <code>.env.example</code> to <code>.env</code>.</li>
            <li>Run <code>docker compose up -d</code> for PostgreSQL and Redis.</li>
            <li>Run <code>pnpm install</code> and then <code>pnpm dev</code>.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}

export default App;
