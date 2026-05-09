import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface LocalModelConfig {
  id: string
  name: string
  source: string
  endpoint: string
  assignedTo: string[]
}

export interface AgentConfig {
  id: string
  name: string
  role: string
  enabled: boolean
  confidenceThreshold: number
  modelAssignmentType: 'default' | 'assigned'
  assignedModelId?: string
}

export interface RiskProfileLocal {
  maxLeverage: number
  maxPositionSizeUsd: number
  maxGrossExposureUsd: number
  maxOpenPositions: number
  dailyLossLimitUsd: number
  maxDrawdownPct: number
  minConfidenceCore: number
  minConfidenceExternal: number
  cooldownSecPerSymbol: number
  maxAtrPct: number
  killSwitchEngaged: boolean
  liveTradingArmed: boolean
}

const DEFAULT_RISK: RiskProfileLocal = {
  maxLeverage: 3,
  maxPositionSizeUsd: 250,
  maxGrossExposureUsd: 1000,
  maxOpenPositions: 4,
  dailyLossLimitUsd: 100,
  maxDrawdownPct: 15,
  minConfidenceCore: 70,
  minConfidenceExternal: 85,
  cooldownSecPerSymbol: 60,
  maxAtrPct: 4.0,
  killSwitchEngaged: false,
  liveTradingArmed: false,
}

interface AppState {
  mode: 'paper' | 'live' | 'shadow'
  activeExchange: 'binance' | 'mexc' | 'auto'
  agents: AgentConfig[]
  models: LocalModelConfig[]
  killSwitchEngaged: boolean
  riskProfile: RiskProfileLocal

  setMode: (mode: 'paper' | 'live' | 'shadow') => void
  setActiveExchange: (exchange: 'binance' | 'mexc' | 'auto') => void
  setKillSwitch: (state: boolean) => void
  setRiskProfile: (updates: Partial<RiskProfileLocal>) => void
  updateAgent: (id: string, updates: Partial<AgentConfig>) => void
  addAgent: (agent: AgentConfig) => void
  addModel: (model: LocalModelConfig) => void
  removeModel: (id: string) => void
  assignModelToAgent: (agentId: string, modelId: string) => void
}

export const usePersistentStore = create<AppState>()(
  persist(
    (set) => ({
      mode: 'paper',
      activeExchange: 'auto',
      agents: [
        { id: 'openclaw', name: 'OpenClaw', role: 'executor', enabled: true, confidenceThreshold: 80, modelAssignmentType: 'default' },
        { id: 'mirofish', name: 'Mirofish', role: 'signal', enabled: true, confidenceThreshold: 85, modelAssignmentType: 'default' },
        { id: 'betafish', name: 'Betafish', role: 'arbitrage', enabled: true, confidenceThreshold: 75, modelAssignmentType: 'default' },
        { id: 'onyx', name: 'Onyx', role: 'research', enabled: true, confidenceThreshold: 80, modelAssignmentType: 'default' },
      ],
      models: [
        { id: 'default-local', name: 'Default Local LLM', source: 'localhost', endpoint: 'http://localhost:11434/v1', assignedTo: ['all'] }
      ],
      killSwitchEngaged: false,
      riskProfile: DEFAULT_RISK,

      setMode: (mode) => set({ mode }),
      setActiveExchange: (exchange) => set({ activeExchange: exchange }),
      setKillSwitch: (state) => set({ killSwitchEngaged: state }),
      setRiskProfile: (updates) => set((s) => ({ riskProfile: { ...s.riskProfile, ...updates } })),

      updateAgent: (id, updates) => set((state) => ({
        agents: state.agents.map(a => a.id === id ? { ...a, ...updates } : a)
      })),

      addAgent: (agent) => set((state) => ({
        agents: [...state.agents, agent]
      })),

      addModel: (model) => set((state) => {
        return { models: [...state.models, model] }
      }),

      removeModel: (id) => set((state) => ({
        models: state.models.filter(m => m.id !== id),
        agents: state.agents.map(a => a.assignedModelId === id ? { ...a, modelAssignmentType: 'default', assignedModelId: undefined } : a)
      })),

      assignModelToAgent: (agentId, modelId) => set((state) => ({
        agents: state.agents.map(a => a.id === agentId ? { ...a, modelAssignmentType: modelId === 'default' ? 'default' : 'assigned', assignedModelId: modelId === 'default' ? undefined : modelId } : a)
      })),
    }),
    {
      name: 'dataclaw-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
