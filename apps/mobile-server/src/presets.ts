export const PRESET_FILTERS = [
  {
    name: 'Action Items',
    prompt: 'Messages that assign a task, request, or deadline to you specifically',
    category: 'all',
    include_dms: true,
    is_preset: true,
  },
  {
    name: 'Follow-ups',
    prompt: "Messages where someone else is expected to do something you want to track",
    category: 'all',
    include_dms: true,
    is_preset: true,
  },
  {
    name: 'Events in San Francisco',
    prompt: 'Messages about meetups, conferences, or in-person events in San Francisco',
    category: 'all',
    include_dms: false,
    is_preset: true,
  },
] as const;
