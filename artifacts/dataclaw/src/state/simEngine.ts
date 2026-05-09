import { create } from 'zustand'

export interface Position {
  id: string
  symbol: string
  side: 'LONG' | 'SHORT'
  size: number
  entryPrice: number
  markPrice: number
  leverage: number
  marginSize: number
  pnl: number
  pnlPercent: number
  liquidationPrice: number
  fees: number
  agentId: string
  openedAt: number
}

export interface EquityPoint {
  t: number
  v: number
}

interface SimState {
  balance: number
  positions: Position[]
  history: Position[]
  equityCurve: EquityPoint[]

  openPosition: (agentId: string, symbol: string, side: 'LONG'|'SHORT', qty: number, price: number, leverage: number) => void
  closePosition: (id: string, price: number) => void
  updatePrices: (prices: Record<string, number>) => void
}

const INITIAL_BALANCE = 100_000;

export const useSimEngine = create<SimState>()((set) => ({
  balance: INITIAL_BALANCE,
  positions: [],
  history: [],
  equityCurve: [{ t: Date.now(), v: INITIAL_BALANCE }],

  openPosition: (agentId, symbol, side, qty, price, leverage) => set((state) => {
    const slippage = price * 0.0005;
    const entryPrice = side === 'LONG' ? price + slippage : price - slippage;
    const notionalValue = qty * entryPrice;
    const marginSize = notionalValue / leverage;
    const fees = notionalValue * 0.0004;

    const newPosition: Position = {
      id: `pos-${Date.now()}`,
      symbol,
      side,
      size: qty,
      entryPrice,
      markPrice: price,
      leverage,
      marginSize,
      pnl: -fees,
      pnlPercent: (-fees / marginSize) * 100,
      liquidationPrice: side === 'LONG' ? entryPrice * (1 - 1/leverage) : entryPrice * (1 + 1/leverage),
      fees,
      agentId,
      openedAt: Date.now()
    }

    return {
      balance: state.balance - fees,
      positions: [...state.positions, newPosition]
    }
  }),

  closePosition: (id, price) => set((state) => {
    const pos = state.positions.find(p => p.id === id);
    if (!pos) return state;

    const slippage = price * 0.0005;
    const exitPrice = pos.side === 'LONG' ? price - slippage : price + slippage;
    const notionalValue = pos.size * exitPrice;
    const closeFees = notionalValue * 0.0004;

    const closedPos = { ...pos, markPrice: exitPrice };
    closedPos.pnl -= closeFees;

    const newBalance = state.balance + closedPos.pnl + closedPos.marginSize;
    const unrealizedFromOthers = state.positions
      .filter(p => p.id !== id)
      .reduce((acc, p) => acc + p.pnl, 0);

    return {
      balance: newBalance,
      positions: state.positions.filter(p => p.id !== id),
      history: [closedPos, ...state.history],
      equityCurve: [
        ...state.equityCurve,
        { t: Date.now(), v: newBalance + unrealizedFromOthers },
      ].slice(-200),
    }
  }),

  updatePrices: (prices) => set((state) => {
    const positions = state.positions.map(pos => {
      const currentPrice = prices[pos.symbol];
      if (!currentPrice) return pos;

      let pnl = 0;
      if (pos.side === 'LONG') {
        pnl = (currentPrice - pos.entryPrice) * pos.size;
      } else {
        pnl = (pos.entryPrice - currentPrice) * pos.size;
      }

      const pnlPercent = (pnl / pos.marginSize) * 100;

      return {
        ...pos,
        markPrice: currentPrice,
        pnl: pnl - pos.fees,
        pnlPercent
      }
    });
    return { positions };
  })
}))
