/** Common IANA timezones; the device timezone is always included first. */
const COMMON = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Muscat', 'Asia/Bahrain', 'Asia/Singapore',
  'Asia/Kuala_Lumpur', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Colombo', 'Asia/Dhaka', 'Asia/Karachi', 'Asia/Kathmandu',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Dublin', 'Africa/Nairobi', 'Africa/Johannesburg',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto',
  'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland', 'UTC',
];

const device = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
})();

export const TIMEZONES: string[] = device && !COMMON.includes(device) ? [device, ...COMMON] : COMMON;
