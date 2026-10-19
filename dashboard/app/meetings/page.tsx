import { MeetingsSchedule } from '@/components/MeetingsSchedule'

export default function MeetingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Meetings & Calendar</h1>
      <p className="text-gray-600 mb-6">Scheduled meetings and action items</p>

      <div className="bg-white rounded-lg shadow p-4">
        <MeetingsSchedule />
      </div>
    </div>
  )
}
