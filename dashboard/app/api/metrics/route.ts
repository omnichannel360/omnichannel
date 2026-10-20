import { NextResponse } from 'next/server'

interface Metrics {
  finance: {
    revenue: number
    expenses: number
    profit: number
    burn_rate: number
  }
  delivery: {
    completed_tasks: number
    pending_tasks: number
    completion_rate: number
    average_cycle_time: number
  }
  sales: {
    pipeline_value: number
    conversion_rate: number
    average_deal_size: number
    month_to_date: number
  }
  team: {
    total_agents: number
    active_agents: number
    utilization_rate: number
    training_hours: number
  }
}

export async function GET() {
  try {
    const metrics: Metrics = {
      finance: {
        revenue: 1250000,
        expenses: 850000,
        profit: 400000,
        burn_rate: 12.5,
      },
      delivery: {
        completed_tasks: 234,
        pending_tasks: 56,
        completion_rate: 80.7,
        average_cycle_time: 4.2,
      },
      sales: {
        pipeline_value: 3500000,
        conversion_rate: 22.5,
        average_deal_size: 145000,
        month_to_date: 580000,
      },
      team: {
        total_agents: 120,
        active_agents: 105,
        utilization_rate: 87.5,
        training_hours: 1240,
      },
    }

    return NextResponse.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load metrics' },
      { status: 500 }
    )
  }
}
