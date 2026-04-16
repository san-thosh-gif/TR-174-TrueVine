import React from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import SensorIngestion from './pages/SensorIngestion'
import DroneImageCapture from './pages/DroneImageCapture'
import VehicleMonitor from './pages/VehicleMonitor'
import DataFlowDiagram from './pages/DataFlowDiagram'
import Assistant from './pages/Assistant'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <nav className="sticky top-0 z-20 border-b border-line bg-[#0b1016]/95 backdrop-blur px-4 py-3">
          <div className="max-w-[1400px] mx-auto flex flex-wrap gap-2 text-sm">
            {[
              ['/', 'Dashboard'],
              ['/sensor', 'Sensor Ingestion'],
              ['/drone', 'Drone Capture'],
              ['/vehicle', 'Vehicle Monitor'],
              ['/dataflow', 'Data Flow'],
              ['/assistant', 'AI Assistant']
            ].map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `px-3 py-1.5 rounded border transition ${isActive ? 'border-white bg-white/10' : 'border-line hover:bg-white/5'}`}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sensor" element={<SensorIngestion />} />
          <Route path="/drone" element={<DroneImageCapture />} />
          <Route path="/vehicle" element={<VehicleMonitor />} />
          <Route path="/dataflow" element={<DataFlowDiagram />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
