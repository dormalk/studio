import { redirect } from 'next/navigation';

export default function DashboardPage() {
  // Default to soldiers page, or implement a dashboard here
  redirect('/soldiers');
}
