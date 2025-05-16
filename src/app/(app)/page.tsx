
import { redirect } from 'next/navigation';

export default function DashboardPage() {
  // Default to divisions page
  redirect('/divisions');
}
