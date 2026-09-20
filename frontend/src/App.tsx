import { useState } from 'react';
import SimulationDashboard from './features/simulation/SimulationDashboard';
import VisualQkdLab from './features/designer/VisualQkdLab';
import BrandLogo from './components/BrandLogo';

type Workspace = 'simulation' | 'designer';

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>('simulation');

  return (
    <>
      <header className="app-header border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <BrandLogo />
          <div>
            <h1 className="brand-title text-2xl font-bold">QuantumShield FinEdu</h1>
            <p className="text-xs text-slate-500 mt-1">Phòng thí nghiệm AI-QKD · Mô phỏng và thiết kế hệ thống</p>
          </div>
        </div>
      </header>
      <nav aria-label="Không gian làm việc" className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2">
          {([
            ['simulation', 'Xem mô phỏng'],
            ['designer', 'Thiết kế hệ thống QKD'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={workspace === value}
              aria-controls={`${value}-workspace`}
              onClick={() => setWorkspace(value)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 ${workspace === value
                ? 'bg-red-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      {/* Keep the dashboard mounted so inputs, uploads, history and in-flight runs survive a workspace switch. */}
      <div id="simulation-workspace" hidden={workspace !== 'simulation'}>
        <SimulationDashboard />
      </div>
      <div id="designer-workspace" hidden={workspace !== 'designer'}>
        <VisualQkdLab active={workspace === 'designer'} />
      </div>
    </>
  );
}
